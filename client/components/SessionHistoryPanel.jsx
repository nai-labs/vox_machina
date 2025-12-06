import { useState } from 'react';
import PropTypes from 'prop-types';
import { Clock, Play, Trash2, Volume2, ChevronDown, ChevronUp, Download } from 'react-feather';
import { formatDuration } from '../hooks/useSessionHistory';

/**
 * SessionHistoryPanel - Displays past sessions with playback capability
 */
export default function SessionHistoryPanel({
    sessions,
    isLoading,
    onPlaySession,
    onDeleteSession,
    onClearAll,
    className = ''
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [playingSessionId, setPlayingSessionId] = useState(null);
    const [audioElement, setAudioElement] = useState(null);

    const handleClearAll = () => {
        if (window.confirm(`Delete all ${sessions.length} sessions? This cannot be undone.`)) {
            if (audioElement) {
                audioElement.pause();
                setPlayingSessionId(null);
            }
            onClearAll?.();
        }
    };

    const handlePlaySession = async (session) => {
        // Stop any currently playing audio
        if (audioElement) {
            audioElement.pause();
            audioElement.currentTime = 0;
        }

        if (playingSessionId === session.id) {
            // Toggle off if clicking same session
            setPlayingSessionId(null);
            setAudioElement(null);
            return;
        }

        if (session.audioBlob) {
            try {
                const url = URL.createObjectURL(session.audioBlob);
                const audio = new Audio(url);

                audio.onended = () => {
                    setPlayingSessionId(null);
                    URL.revokeObjectURL(url);
                };

                audio.onerror = (e) => {
                    console.error('[SessionHistory] Audio playback error:', e);
                    setPlayingSessionId(null);
                };

                setAudioElement(audio);
                setPlayingSessionId(session.id);
                await audio.play();
            } catch (error) {
                console.error('[SessionHistory] Failed to play session:', error);
            }
        } else if (onPlaySession) {
            onPlaySession(session);
        }
    };

    const handleDeleteSession = (session, e) => {
        e.stopPropagation();
        if (window.confirm(`Delete session "${session.displayName}"?`)) {
            if (playingSessionId === session.id && audioElement) {
                audioElement.pause();
                setPlayingSessionId(null);
            }
            onDeleteSession(session.id);
        }
    };

    const handleDownloadSession = (session, e) => {
        e.stopPropagation();
        if (!session.audioBlob) {
            console.warn('[SessionHistory] No audio to download');
            return;
        }

        try {
            const url = URL.createObjectURL(session.audioBlob);
            const a = document.createElement('a');
            a.href = url;
            // Create a clean filename from the display name
            const cleanName = session.displayName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
            const extension = session.audioBlob.type.includes('wav') ? 'wav' : 'webm';
            a.download = `${cleanName}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('[SessionHistory] Downloaded:', a.download);
        } catch (error) {
            console.error('[SessionHistory] Download failed:', error);
        }
    };

    if (isLoading) {
        return (
            <div className={`terminal-panel p-3 ${className}`}>
                <div className="text-neon-secondary animate-pulse text-sm">Loading session history...</div>
            </div>
        );
    }

    if (sessions.length === 0) {
        return (
            <div className={`terminal-panel p-3 ${className}`}>
                <div className="flex items-center gap-2 text-neon-secondary/50 text-sm">
                    <Clock size={14} />
                    <span>No saved sessions yet</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`terminal-panel ${className}`}>
            {/* Header - always visible */}
            <div className="flex items-center justify-between p-3">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex-1 flex items-center gap-2 text-neon-primary hover:bg-cyber-light/10 transition-colors rounded px-2 py-1 -ml-2"
                >
                    <Clock size={16} />
                    <span className="text-sm font-medium">SESSION HISTORY</span>
                    <span className="text-xs text-neon-secondary">({sessions.length})</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {onClearAll && sessions.length > 0 && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClearAll();
                        }}
                        className="p-1.5 rounded text-red-400 hover:bg-red-500/20 transition-colors text-xs flex items-center gap-1"
                        title="Clear all sessions"
                    >
                        <Trash2 size={14} />
                        <span className="hidden sm:inline">CLEAR ALL</span>
                    </button>
                )}
            </div>

            {/* Session list - collapsible */}
            {isExpanded && (
                <div className="border-t border-neon-primary/20 max-h-48 overflow-y-auto">
                    {sessions.map((session) => (
                        <div
                            key={session.id}
                            className={`flex items-center justify-between p-2 px-3 border-b border-cyber-light/10 hover:bg-cyber-light/10 transition-colors cursor-pointer ${playingSessionId === session.id ? 'bg-neon-primary/10' : ''
                                }`}
                            onClick={() => handlePlaySession(session)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="text-sm text-cyber-text truncate">
                                    {session.displayName}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-neon-secondary/70">
                                    {session.duration && (
                                        <span className="flex items-center gap-1">
                                            <Volume2 size={10} />
                                            {formatDuration(session.duration)}
                                        </span>
                                    )}
                                    {session.provider && (
                                        <span className="uppercase">{session.provider}</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-1 ml-2">
                                {session.audioBlob && (
                                    <>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePlaySession(session);
                                            }}
                                            className={`p-1.5 rounded transition-colors ${playingSessionId === session.id
                                                ? 'bg-neon-primary text-cyber-dark'
                                                : 'text-neon-primary hover:bg-neon-primary/20'
                                                }`}
                                            title={playingSessionId === session.id ? 'Stop' : 'Play'}
                                        >
                                            <Play size={14} />
                                        </button>
                                        <button
                                            onClick={(e) => handleDownloadSession(session, e)}
                                            className="p-1.5 rounded text-neon-secondary hover:bg-neon-secondary/20 transition-colors"
                                            title="Download audio"
                                        >
                                            <Download size={14} />
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={(e) => handleDeleteSession(session, e)}
                                    className="p-1.5 rounded text-red-400 hover:bg-red-500/20 transition-colors"
                                    title="Delete session"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

SessionHistoryPanel.propTypes = {
    sessions: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.number.isRequired,
        displayName: PropTypes.string.isRequired,
        characterId: PropTypes.string,
        characterName: PropTypes.string,
        timestamp: PropTypes.number,
        duration: PropTypes.number,
        provider: PropTypes.string,
        audioBlob: PropTypes.instanceOf(Blob)
    })).isRequired,
    isLoading: PropTypes.bool,
    onPlaySession: PropTypes.func,
    onDeleteSession: PropTypes.func.isRequired,
    onClearAll: PropTypes.func,
    className: PropTypes.string
};
