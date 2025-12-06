/**
 * ProviderToggle component for switching between OpenAI and Gemini providers
 */
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Toggle button group for selecting the AI provider
 * @param {Object} props
 * @param {string} props.currentProvider - Current provider ('openai' or 'gemini')
 * @param {function} props.onProviderChange - Callback when provider changes
 * @param {boolean} props.disabled - Whether the toggle is disabled (e.g., during active session)
 */
export function ProviderToggle({ currentProvider, onProviderChange, disabled }) {
    return (
        <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 p-1 sm:p-2 rounded-md bg-cyber-dark-secondary border border-neon-secondary shadow-lg">
            <span className="text-xs text-neon-secondary uppercase tracking-wider mr-0 sm:mr-2 hidden sm:inline">
                Provider:
            </span>
            <div className="flex gap-1">
                <button
                    onClick={() => onProviderChange('openai')}
                    disabled={disabled}
                    className={`terminal-button px-2 sm:px-3 py-1 text-xs sm:text-sm ${currentProvider === 'openai'
                            ? 'bg-neon-primary text-cyber-dark'
                            : 'text-neon-primary hover:bg-neon-primary/20'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    OpenAI
                </button>
                <button
                    onClick={() => onProviderChange('gemini')}
                    disabled={disabled}
                    className={`terminal-button px-2 sm:px-3 py-1 text-xs sm:text-sm ${currentProvider === 'gemini'
                            ? 'bg-neon-primary text-cyber-dark'
                            : 'text-neon-primary hover:bg-neon-primary/20'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    Gemini
                </button>
            </div>
        </div>
    );
}

ProviderToggle.propTypes = {
    currentProvider: PropTypes.oneOf(['openai', 'gemini']).isRequired,
    onProviderChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool
};

ProviderToggle.defaultProps = {
    disabled: false
};

export default ProviderToggle;
