/**
 * Sentry Error Tracking for SharedDrop (Main Process)
 * 
 * Initialize this module at the very top of the main entry point.
 * DSN should be provided via SENTRY_DSN environment variable.
 */
import 'dotenv/config';
import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';

const SENTRY_DSN = process.env.SENTRY_DSN;

/**
 * Initialize Sentry for the main process.
 * Call this as early as possible in your app startup.
 */
export function initSentry() {
    if (!SENTRY_DSN) {
        console.warn('[Sentry] No DSN configured. Error tracking disabled.');
        console.warn('[Sentry] Set SENTRY_DSN environment variable to enable.');
        return false;
    }

    try {
        Sentry.init({
            dsn: SENTRY_DSN,
            release: `sharedrop@${app.getVersion()}`,
            environment: process.env.NODE_ENV || 'production',

            // Sample rate for errors (1.0 = 100%)
            sampleRate: 1.0,

            // Automatically capture breadcrumbs for context
            beforeBreadcrumb(breadcrumb) {
                // Scrub any sensitive data from breadcrumbs
                if (breadcrumb.data?.password) {
                    breadcrumb.data.password = '[REDACTED]';
                }
                return breadcrumb;
            },

            // Filter/modify events before sending
            beforeSend(event) {
                // Scrub any potential sensitive data from events
                if (event.extra?.password) {
                    event.extra.password = '[REDACTED]';
                }
                return event;
            }
        });

        console.log('[Sentry] Error tracking initialized');
        return true;
    } catch (error) {
        console.error('[Sentry] Failed to initialize:', error);
        return false;
    }
}

/**
 * Set user context for error tracking.
 * Call this when user identity is known.
 */
export function setUserContext(userData) {
    Sentry.setUser(userData);
}

/**
 * Clear user context (e.g., on logout).
 */
export function clearUserContext() {
    Sentry.setUser(null);
}

/**
 * Set additional context for the current session.
 */
export function setSessionContext(context) {
    Sentry.setContext('session', context);
}

/**
 * Capture an exception manually with optional extras.
 */
export function captureException(error, extras = {}) {
    Sentry.captureException(error, { extra: extras });
}

/**
 * Capture a message (non-error event).
 */
export function captureMessage(message, level = 'info') {
    Sentry.captureMessage(message, level);
}

/**
 * Add a breadcrumb for debugging context.
 */
export function addBreadcrumb(category, message, data = {}) {
    Sentry.addBreadcrumb({
        category,
        message,
        data,
        level: 'info'
    });
}

export default Sentry;
