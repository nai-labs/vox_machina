import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * CharacterPortrait - Displays character avatar during active sessions
 * Supports level-based images (1-10) with visual effects at high intensity
 */
export default function CharacterPortrait({
    character,
    intensityLevel = 1,
    isActive = false,
    className = ''
}) {
    const [imageSrc, setImageSrc] = useState(null);
    const [hasLevelImages, setHasLevelImages] = useState(false);

    useEffect(() => {
        if (!character) return;

        const defaultImagePath = character.avatarPath || `/assets/avatars/${character.id}.png`;

        // Try JPG first, then PNG, then fallback to default avatar
        const tryLoadImage = (paths, index = 0) => {
            if (index >= paths.length) {
                // All level images failed, use default
                setImageSrc(defaultImagePath);
                setHasLevelImages(false);
                return;
            }

            const img = new Image();
            img.onload = () => {
                setImageSrc(paths[index]);
                setHasLevelImages(true);
            };
            img.onerror = () => {
                // Try next path
                tryLoadImage(paths, index + 1);
            };
            img.src = paths[index];
        };

        // Try jpg first, then png
        const levelImagePaths = [
            `/assets/avatars/${character.id}/${intensityLevel}.jpg`,
            `/assets/avatars/${character.id}/${intensityLevel}.png`
        ];

        tryLoadImage(levelImagePaths);
    }, [character, intensityLevel]);

    if (!character || !imageSrc) {
        return null;
    }

    // Calculate visual effects based on intensity level
    const getGlowIntensity = () => {
        if (intensityLevel <= 3) return 0;
        if (intensityLevel <= 6) return 0.3;
        if (intensityLevel <= 8) return 0.5;
        return 0.8;
    };

    const getBlushOverlay = () => {
        if (intensityLevel < 7) return 0;
        return (intensityLevel - 6) * 0.1; // 0.1 at 7, 0.2 at 8, etc.
    };

    const shouldShake = intensityLevel >= 10;
    const glowIntensity = getGlowIntensity();
    const blushOverlay = getBlushOverlay();

    // Glow color based on intensity
    const getGlowColor = () => {
        if (intensityLevel <= 3) return 'rgba(10, 255, 255, 0.5)'; // Cyan
        if (intensityLevel <= 6) return 'rgba(255, 0, 255, 0.5)';   // Magenta
        return 'rgba(255, 50, 50, 0.6)';                            // Red
    };

    return (
        <div
            className={`relative flex-shrink-0 ${className}`}
            style={{
                animation: shouldShake ? 'portrait-shake 0.1s infinite' : 'none',
            }}
        >
            {/* Main portrait image */}
            <div
                className="relative overflow-hidden rounded-lg border-2 border-neon-primary/50"
                style={{
                    boxShadow: isActive && glowIntensity > 0
                        ? `0 0 ${20 * glowIntensity}px ${getGlowColor()}, inset 0 0 ${10 * glowIntensity}px ${getGlowColor()}`
                        : '0 0 10px rgba(10, 255, 255, 0.3)',
                }}
            >
                <img
                    src={imageSrc}
                    alt={character.name}
                    className="w-full h-full object-cover"
                    style={{
                        filter: isActive && glowIntensity > 0
                            ? `brightness(${1 + glowIntensity * 0.2}) saturate(${1 + glowIntensity * 0.3})`
                            : 'none',
                    }}
                />

                {/* Blush overlay at high intensity */}
                {blushOverlay > 0 && (
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background: `radial-gradient(ellipse at 30% 40%, rgba(255, 100, 100, ${blushOverlay}) 0%, transparent 50%),
                           radial-gradient(ellipse at 70% 40%, rgba(255, 100, 100, ${blushOverlay}) 0%, transparent 50%)`,
                        }}
                    />
                )}

                {/* Scan line effect */}
                <div className="absolute inset-0 pointer-events-none bg-scan-lines opacity-20" />

                {/* Breathing glow animation when active */}
                {isActive && (
                    <div
                        className="absolute inset-0 pointer-events-none animate-pulse"
                        style={{
                            background: `radial-gradient(ellipse at center, ${getGlowColor().replace('0.5', '0.1')} 0%, transparent 70%)`,
                        }}
                    />
                )}
            </div>

            {/* Character name label - inside the image at bottom */}
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-cyber-dark/90 border border-neon-primary/50 px-3 py-1 rounded text-xs text-neon-primary whitespace-nowrap">
                {character.name}
            </div>

            {/* Intensity indicator (when level images are available) */}
            {hasLevelImages && isActive && (
                <div className="absolute -top-1 -right-1 bg-cyber-dark border border-neon-secondary px-1.5 py-0.5 rounded text-xs text-neon-secondary font-mono">
                    {intensityLevel}
                </div>
            )}
        </div>
    );
}

CharacterPortrait.propTypes = {
    character: PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        avatarPath: PropTypes.string,
    }),
    intensityLevel: PropTypes.number,
    isActive: PropTypes.bool,
    className: PropTypes.string,
};
