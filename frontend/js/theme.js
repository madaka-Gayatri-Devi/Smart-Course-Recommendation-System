/**
 * SmartLearn Centralized Theme & Appearance Engine
 * ===================================================
 * Manages dual-axis theming:
 * 1. Appearance Mode: Light, Dark, or System (OS preference tracking)
 * 2. Accent Color Palette: Purple (default brand), Pink, Orange, Blue, Green
 *
 * Implements non-intrusive DOM updates via data-* attributes on <html>,
 * persists user choices across sessions via localStorage, and coordinates
 * popover UI controls on topbars across all portal pages.
 */

// ==========================================
// THEME DEFINITIONS & COLOR PALETTES
// Defines color constants, hex values, and gradients for each theme option.
// ==========================================

(function () {
    const STORAGE_KEY_THEME = 'smartlearn-theme';
    const STORAGE_KEY_APPEARANCE = 'smartlearn-appearance';
    const STORAGE_KEY_COLOR = 'smartlearn-color-theme';
    const STORAGE_KEY_BRAND = 'smartlearn-brand-theme';
    
    // Legacy keys retained for backwards compatibility with earlier platform builds
    const LEGACY_KEY_APPEARANCE = 'smartlearn_appearance';
    const LEGACY_KEY_COLOR = 'smartlearn_theme';

    /**
     * Color palette definitions supporting multi-theme UI styling.
     * Each palette provides primary, hover, secondary, accent, and alpha variations.
     */
    const COLOR_THEMES = {
        purple: {
            name: 'Purple',
            primary: '#5B3FE8',
            primaryHover: '#4B32D0',
            secondary: '#8B4AD9',
            accent: '#E83FA5',
            lightBg: '#F8F7FF',
            primaryAlpha: 'rgba(91, 63, 232, 0.15)',
            sidebarGrad: 'linear-gradient(180deg, #24104F 0%, #3B176F 50%, #5B21B6 100%)'
        },
        pink: {
            name: 'Pink',
            primary: '#E83FA5',
            primaryHover: '#D02B8E',
            secondary: '#F21B8F',
            accent: '#8B4AD9',
            lightBg: '#FFF5FA',
            primaryAlpha: 'rgba(232, 63, 165, 0.15)',
            sidebarGrad: 'linear-gradient(180deg, #4A0E35 0%, #6E124F 50%, #9C1B6E 100%)'
        },
        orange: {
            name: 'Orange',
            primary: '#F97316',
            primaryHover: '#EA580C',
            secondary: '#EA580C',
            accent: '#F59E0B',
            lightBg: '#FFF7ED',
            primaryAlpha: 'rgba(249, 115, 22, 0.15)',
            sidebarGrad: 'linear-gradient(180deg, #431407 0%, #7C2D12 50%, #9A3412 100%)'
        },
        blue: {
            name: 'Blue',
            primary: '#2563EB',
            primaryHover: '#1D4ED8',
            secondary: '#4F46E5',
            accent: '#06B6D4',
            lightBg: '#F5F9FF',
            primaryAlpha: 'rgba(37, 99, 235, 0.15)',
            sidebarGrad: 'linear-gradient(180deg, #0F172A 0%, #1E293B 50%, #1E40AF 100%)'
        },
        green: {
            name: 'Green',
            primary: '#059669',
            primaryHover: '#047857',
            secondary: '#0D9488',
            accent: '#14B8A6',
            lightBg: '#F0FDFA',
            primaryAlpha: 'rgba(5, 150, 105, 0.15)',
            sidebarGrad: 'linear-gradient(180deg, #022C22 0%, #064E3B 50%, #047857 100%)'
        }
    };

    // ==========================================
    // PERSISTENCE & STORAGE HELPERS
    // Reads, validates, and normalizes stored theme preferences.
    // ==========================================

    /**
     * Retrieves the stored appearance mode preference ('light', 'dark', or 'system').
     *
     * @returns {'light'|'dark'|'system'} Normalized appearance mode string.
     *
     * Purpose:
     * Reads saved appearance mode from localStorage with fallback for legacy settings.
     *
     * Input:
     * Reads STORAGE_KEY_APPEARANCE ('smartlearn-appearance') and fallback legacy keys.
     *
     * Processing:
     * 1. Inspects modern appearance key in localStorage.
     * 2. If absent, checks legacy appearance and theme keys.
     * 3. Defaults safely to 'light' if unconfigured or unrecognized.
     *
     * Output:
     * Returns validated mode: 'light', 'dark', or 'system'.
     *
     * Error handling:
     * Gracefully handles disabled or blocked localStorage by returning default 'light'.
     */
    function getStoredAppearance() {
        let mode = localStorage.getItem(STORAGE_KEY_APPEARANCE) || localStorage.getItem(LEGACY_KEY_APPEARANCE);
        if (!mode || !['light', 'dark', 'system'].includes(mode)) {
            const legacyTheme = localStorage.getItem(STORAGE_KEY_THEME);
            if (legacyTheme === 'dark' || legacyTheme === 'system') {
                mode = legacyTheme;
            } else {
                mode = 'light';
            }
        }
        return mode;
    }

    /**
     * Retrieves the stored accent color theme key.
     *
     * @returns {string} Color theme identifier ('purple', 'pink', 'orange', 'blue', or 'green').
     *
     * Purpose:
     * Resolves the user's preferred brand accent color from localStorage.
     *
     * Input:
     * Reads STORAGE_KEY_COLOR ('smartlearn-color-theme') and legacy keys.
     *
     * Processing:
     * 1. Checks modern color theme storage keys.
     * 2. Validates whether the retrieved key exists in COLOR_THEMES map.
     * 3. Falls back to default 'purple' brand theme if invalid.
     *
     * Output:
     * Valid color theme string.
     *
     * Dependencies:
     * COLOR_THEMES dictionary.
     */
    function getStoredColorTheme() {
        let theme = localStorage.getItem(STORAGE_KEY_COLOR) || localStorage.getItem(STORAGE_KEY_BRAND) || localStorage.getItem(LEGACY_KEY_COLOR);
        if (!theme || !COLOR_THEMES[theme]) {
            const legacyTheme = localStorage.getItem(STORAGE_KEY_THEME);
            if (COLOR_THEMES[legacyTheme]) {
                theme = legacyTheme;
            } else {
                theme = 'purple';
            }
        }
        return theme;
    }

    /**
     * Resolves an appearance setting to an actual active mode ('light' or 'dark').
     *
     * @param {'light'|'dark'|'system'} mode - The configured appearance mode.
     * @returns {'light'|'dark'} The concrete visual rendering mode.
     *
     * Purpose:
     * Evaluates OS color scheme media query if 'system' is selected.
     *
     * Input:
     * mode: string ('light', 'dark', or 'system').
     *
     * Processing:
     * 1. If mode is 'system', queries window.matchMedia('(prefers-color-scheme: dark)').
     * 2. Returns 'dark' if OS matches dark preference; otherwise 'light'.
     * 3. If mode is explicitly 'light' or 'dark', returns it directly.
     *
     * Dependencies:
     * Browser window.matchMedia API.
     */
    function resolveAppearanceMode(mode) {
        if (mode === 'system') {
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            return prefersDark ? 'dark' : 'light';
        }
        return mode;
    }

    // ==========================================
    // DOM MANIPULATION & THEME APPLICATION
    // Applies HTML attributes and dispatches theme change events.
    // ==========================================

    /**
     * Applies theme attributes directly to the document root element (<html>).
     *
     * @param {'light'|'dark'|'system'} appearanceMode - User's appearance setting.
     * @param {string} colorTheme - User's accent color theme identifier.
     *
     * Purpose:
     * Updates data-* attributes on <html> to trigger CSS attribute selectors.
     *
     * Processing:
     * 1. Resolves appearanceMode to actual 'light' or 'dark' via resolveAppearanceMode.
     * 2. Sets data-appearance and data-resolved-appearance attributes on <html>.
     * 3. Sets data-theme and data-color-theme attributes.
     * 4. Updates documentElement.dataset properties for JS compatibility.
     *
     * Dependencies:
     * Document documentElement (<html>) and CSS selectors in style.css.
     */
    function applyThemeToDOM(appearanceMode, colorTheme) {
        const resolvedAppearance = resolveAppearanceMode(appearanceMode);
        const root = document.documentElement;

        root.setAttribute('data-appearance', appearanceMode);
        root.setAttribute('data-resolved-appearance', resolvedAppearance);
        root.setAttribute('data-theme', colorTheme);
        root.setAttribute('data-color-theme', colorTheme);

        root.dataset.theme = colorTheme;
        root.dataset.colorTheme = colorTheme;
        root.dataset.appearanceMode = appearanceMode;
        root.dataset.resolvedAppearance = resolvedAppearance;
    }

    // Execute immediately on script load to prevent theme flash (FOUC)
    let currentAppearance = getStoredAppearance();
    let currentColorTheme = getStoredColorTheme();

    applyThemeToDOM(currentAppearance, currentColorTheme);

    // Listen for OS system theme changes dynamically
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (currentAppearance === 'system') {
                applyThemeToDOM(currentAppearance, currentColorTheme);
                notifyThemeChanged();
            }
        });
    }

    /**
     * Broadcasts a custom 'smartlearn:themechanged' event to notify charts and components.
     *
     * Purpose:
     * Allows dynamic components (e.g. Chart.js in admin/instructor dashboards) to repaint
     * with updated foreground/background/accent colors upon theme switch.
     *
     * Output:
     * Dispatches window CustomEvent with theme detail object.
     */
    function notifyThemeChanged() {
        const event = new CustomEvent('smartlearn:themechanged', {
            detail: {
                appearance: currentAppearance,
                resolvedAppearance: resolveAppearanceMode(currentAppearance),
                colorTheme: currentColorTheme,
                colors: COLOR_THEMES[currentColorTheme]
            }
        });
        window.dispatchEvent(event);
    }

    // ==========================================
    // THEME POPOVER COMPONENT BUILDER
    // Creates and manages the floating theme selection card in the DOM.
    // ==========================================

    /**
     * Ensures the custom theme selector popover exists in document.body.
     *
     * @returns {HTMLElement} The popover container element (#smartlearnThemeDropdown).
     *
     * Purpose:
     * Lazily constructs and mounts the theme popover DOM structure with accessible ARIA attributes.
     *
     * Processing:
     * 1. Checks if #smartlearnThemeDropdown already exists in the document.
     * 2. If not found, builds HTML containing Appearance options (Light/Dark/System)
     *    and Color Theme swatches (Purple/Pink/Orange/Blue/Green).
     * 3. Appends the element to document.body once DOM is available.
     *
     * Dependencies:
     * FontAwesome icon classes (fa-sun, fa-moon, fa-desktop, fa-palette, fa-check).
     */
    function ensureDropdownInDOM() {
        let dropdown = document.getElementById('smartlearnThemeDropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'smartlearnThemeDropdown';
            dropdown.className = 'smartlearn-theme-popover';
            dropdown.setAttribute('role', 'menu');
            dropdown.setAttribute('aria-hidden', 'true');
            dropdown.style.setProperty('display', 'none', 'important');

            dropdown.innerHTML = `
                <div class="popover-header">
                    <div class="popover-title">Theme Settings</div>
                    <div class="popover-subtitle">Choose your preferred appearance</div>
                </div>
                <div class="popover-divider"></div>

                <div class="popover-section-label">APPEARANCE</div>
                <div class="popover-options-vertical">
                    <div class="custom-theme-card" data-appearance-option="light" data-theme="light" role="menuitem" tabindex="0">
                        <div class="opt-left">
                            <i class="fa-regular fa-sun opt-icon"></i>
                            <span class="opt-name">Light</span>
                        </div>
                        <span class="opt-check"><i class="fa-solid fa-check"></i></span>
                    </div>
                    <div class="custom-theme-card" data-appearance-option="dark" data-theme="dark" role="menuitem" tabindex="0">
                        <div class="opt-left">
                            <i class="fa-regular fa-moon opt-icon"></i>
                            <span class="opt-name">Dark</span>
                        </div>
                        <span class="opt-check"><i class="fa-solid fa-check"></i></span>
                    </div>
                    <div class="custom-theme-card" data-appearance-option="system" data-theme="system" role="menuitem" tabindex="0">
                        <div class="opt-left">
                            <i class="fa-solid fa-desktop opt-icon"></i>
                            <span class="opt-name">System</span>
                        </div>
                        <span class="opt-check"><i class="fa-solid fa-check"></i></span>
                    </div>
                </div>

                <div class="popover-section-label" style="margin-top: 14px;">COLOR THEME</div>
                <div class="popover-options-grid">
                    <div class="custom-theme-card color-card" data-color-option="purple" data-theme="purple" role="menuitem" tabindex="0">
                        <div class="opt-left">
                            <span class="swatch-dot purple"></span>
                            <span class="opt-name">Purple</span>
                        </div>
                        <span class="opt-check"><i class="fa-solid fa-check"></i></span>
                    </div>
                    <div class="custom-theme-card color-card" data-color-option="pink" data-theme="pink" role="menuitem" tabindex="0">
                        <div class="opt-left">
                            <span class="swatch-dot pink"></span>
                            <span class="opt-name">Pink</span>
                        </div>
                        <span class="opt-check"><i class="fa-solid fa-check"></i></span>
                    </div>
                    <div class="custom-theme-card color-card" data-color-option="orange" data-theme="orange" role="menuitem" tabindex="0">
                        <div class="opt-left">
                            <span class="swatch-dot orange"></span>
                            <span class="opt-name">Orange</span>
                        </div>
                        <span class="opt-check"><i class="fa-solid fa-check"></i></span>
                    </div>
                    <div class="custom-theme-card color-card" data-color-option="blue" data-theme="blue" role="menuitem" tabindex="0">
                        <div class="opt-left">
                            <span class="swatch-dot blue"></span>
                            <span class="opt-name">Blue</span>
                        </div>
                        <span class="opt-check"><i class="fa-solid fa-check"></i></span>
                    </div>
                    <div class="custom-theme-card color-card" data-color-option="green" data-theme="green" role="menuitem" tabindex="0">
                        <div class="opt-left">
                            <span class="swatch-dot green"></span>
                            <span class="opt-name">Green</span>
                        </div>
                        <span class="opt-check"><i class="fa-solid fa-check"></i></span>
                    </div>
                </div>
            `;
        }

        if (document.body && (!dropdown.parentNode || dropdown.parentNode !== document.body)) {
            document.body.appendChild(dropdown);
        } else if (!document.body) {
            document.addEventListener('DOMContentLoaded', () => {
                if (dropdown && dropdown.parentNode !== document.body) {
                    document.body.appendChild(dropdown);
                }
            });
        }

        return dropdown;
    }

    /**
     * Replaces legacy <select> dropdowns with modern palette button triggers across topbars.
     *
     * Purpose:
     * Standardizes all theme trigger elements into unified interactive buttons.
     *
     * Processing:
     * 1. Finds all #themePaletteButton, [data-open-theme-modal], and .theme-palette-btn elements.
     * 2. If an element is an obsolete HTML <select>, replaces it with a styled <button>.
     * 3. Injects palette icon, label, and chevron arrow.
     * 4. Updates styles according to resolved light/dark appearance mode.
     */
    function formatThemeButtons() {
        const triggerBtns = document.querySelectorAll('#themePaletteButton, [data-open-theme-modal], .theme-palette-btn, .theme-palette-button');
        triggerBtns.forEach(btn => {
            if (btn.tagName === 'SELECT') {
                const newBtn = document.createElement('button');
                newBtn.type = 'button';
                newBtn.id = btn.id || 'themePaletteButton';
                newBtn.className = 'theme-palette-btn';
                btn.parentNode.replaceChild(newBtn, btn);
                btn = newBtn;
            }
            if (!btn.querySelector('.theme-btn-text')) {
                btn.innerHTML = `<i class="fa-solid fa-palette theme-btn-icon"></i><span class="theme-btn-text">Theme</span><i class="fa-solid fa-chevron-down theme-btn-arrow"></i>`;
            }
            btn.className = 'theme-palette-btn';
            btn.style.setProperty('display', 'inline-flex', 'important');
            btn.style.setProperty('align-items', 'center', 'important');
            btn.style.setProperty('justify-content', 'center', 'important');
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                btn.style.setProperty('gap', '0', 'important');
                btn.style.setProperty('padding', '0', 'important');
                btn.style.setProperty('width', '32px', 'important');
                btn.style.setProperty('height', '32px', 'important');
                btn.style.setProperty('min-width', '32px', 'important');
                btn.style.setProperty('max-width', '32px', 'important');
                btn.style.setProperty('border-radius', '8px', 'important');
                btn.style.setProperty('flex-shrink', '0', 'important');
            } else {
                btn.style.setProperty('gap', '6px', 'important');
                btn.style.setProperty('padding', '5px 14px', 'important');
                btn.style.setProperty('width', 'auto', 'important');
                btn.style.setProperty('height', '36px', 'important');
                btn.style.setProperty('min-width', 'auto', 'important');
                btn.style.setProperty('max-width', 'none', 'important');
                btn.style.setProperty('border-radius', '10px', 'important');
                btn.style.removeProperty('flex-shrink');
            }
            btn.style.setProperty('cursor', 'pointer', 'important');
            btn.style.setProperty('font-size', '13px', 'important');
            btn.style.setProperty('font-weight', '600', 'important');
            btn.style.setProperty('font-family', 'inherit', 'important');
            btn.style.setProperty('appearance', 'none', 'important');
            btn.style.setProperty('-webkit-appearance', 'none', 'important');
            btn.style.setProperty('outline', 'none', 'important');

            const isDark = resolveAppearanceMode(currentAppearance) === 'dark';
            if (isDark) {
                btn.style.setProperty('background-color', '#1E293B', 'important');
                btn.style.setProperty('color', '#F8FAFC', 'important');
                btn.style.setProperty('border', '1px solid #334155', 'important');
            } else {
                btn.style.setProperty('background-color', '#FFFFFF', 'important');
                btn.style.setProperty('color', '#172033', 'important');
                btn.style.setProperty('border', '1px solid #E2E8F0', 'important');
            }
        });
    }

    /**
     * Synchronizes selection checkmarks and active states inside the theme popover cards.
     *
     * Purpose:
     * Reflects active appearance mode and color theme choices visually in the popover.
     *
     * Processing:
     * 1. Iterates over all theme option cards.
     * 2. Checks data-appearance-option and data-color-option attributes.
     * 3. Toggles 'selected' CSS class and updates aria-selected attributes.
     * 4. Synchronizes aria-expanded on all theme trigger buttons.
     */
    function updateUIState() {
        const activeAppearance = currentAppearance;
        const activeColor = currentColorTheme;

        document.querySelectorAll('.custom-theme-card, .custom-theme-item, .theme-option').forEach(el => {
            const appOpt = el.getAttribute('data-appearance-option');
            const colorOpt = el.getAttribute('data-color-option');
            const themeOpt = el.getAttribute('data-theme') || el.getAttribute('data-theme-option');

            let isSelected = false;
            if (appOpt) {
                isSelected = (appOpt === activeAppearance);
            } else if (colorOpt) {
                isSelected = (colorOpt === activeColor);
            } else if (themeOpt) {
                if (['light', 'dark', 'system'].includes(themeOpt)) {
                    isSelected = (themeOpt === activeAppearance);
                } else {
                    isSelected = (themeOpt === activeColor);
                }
            }

            if (isSelected) {
                el.classList.add('selected');
                el.setAttribute('aria-selected', 'true');
            } else {
                el.classList.remove('selected');
                el.setAttribute('aria-selected', 'false');
            }
        });

        const isDropdownOpen = isDropdownVisible();
        const triggerBtns = document.querySelectorAll('#themePaletteButton, [data-open-theme-modal], .theme-palette-btn, .theme-palette-button, [data-action="open-theme"]');
        triggerBtns.forEach(btn => {
            btn.setAttribute('aria-expanded', isDropdownOpen ? 'true' : 'false');
        });

        const dropdown = document.getElementById('smartlearnThemeDropdown');
        if (dropdown) {
            dropdown.setAttribute('aria-hidden', isDropdownOpen ? 'false' : 'true');
        }
    }

    /**
     * Checks whether the theme popover dropdown is currently open and visible.
     *
     * @returns {boolean} True if popover is displayed, false otherwise.
     */
    function isDropdownVisible() {
        const dropdown = document.getElementById('smartlearnThemeDropdown');
        return dropdown && dropdown.classList.contains('open');
    }

    /**
     * Computes optimal screen coordinates and positions the popover relative to the trigger button.
     *
     * @param {HTMLElement} [triggerBtn] - The button element that opened the popover.
     *
     * Purpose:
     * Accurately anchors the popover below the trigger button, preventing clipping offscreen.
     *
     * Processing:
     * 1. Resolves active trigger button if not passed explicitly.
     * 2. Reads bounding client rect (top, right, bottom).
     * 3. Calculates vertical alignment, flipping above if near bottom viewport boundary.
     * 4. Centers popover on small mobile viewports (< 480px).
     * 5. Sets fixed positioning and high z-index (1,000,000) above modals and sidebars.
     */
    function positionDropdown(triggerBtn) {
        const dropdown = ensureDropdownInDOM();
        if (!dropdown) return;

        if (!triggerBtn) {
            triggerBtn = document.getElementById('themePaletteButton') ||
                         document.querySelector('.theme-palette-button') ||
                         document.querySelector('[data-open-theme-modal]') ||
                         document.querySelector('.theme-palette-btn') ||
                         document.querySelector('[data-action="open-theme"]');
        }

        if (triggerBtn) {
            const rect = triggerBtn.getBoundingClientRect();
            let top = rect.bottom + 6;
            let right = Math.max(12, window.innerWidth - rect.right);
            
            const dropdownHeight = 360;
            if (top + dropdownHeight > window.innerHeight && rect.top > dropdownHeight) {
                top = Math.max(8, rect.top - dropdownHeight - 6);
            }

            if (window.innerWidth < 480) {
                right = Math.max(8, (window.innerWidth - 260) / 2);
            }

            dropdown.style.setProperty('position', 'fixed', 'important');
            dropdown.style.setProperty('top', `${top}px`, 'important');
            dropdown.style.setProperty('right', `${right}px`, 'important');
            dropdown.style.setProperty('left', 'auto', 'important');
            dropdown.style.setProperty('z-index', '1000000', 'important');
            dropdown.style.setProperty('width', '260px', 'important');
            dropdown.style.setProperty('min-width', '260px', 'important');
            dropdown.style.setProperty('max-width', 'calc(100vw - 20px)', 'important');
            dropdown.style.setProperty('box-sizing', 'border-box', 'important');
            dropdown.style.setProperty('padding', '14px', 'important');
            dropdown.style.setProperty('border-radius', '14px', 'important');

            const isDark = resolveAppearanceMode(currentAppearance) === 'dark';
            if (isDark) {
                dropdown.style.setProperty('background-color', '#1E293B', 'important');
                dropdown.style.setProperty('color', '#F8FAFC', 'important');
                dropdown.style.setProperty('border', '1px solid #334155', 'important');
                dropdown.style.setProperty('box-shadow', '0 16px 36px -5px rgba(0, 0, 0, 0.5), 0 4px 14px -2px rgba(0, 0, 0, 0.4)', 'important');
            } else {
                dropdown.style.setProperty('background-color', '#FFFFFF', 'important');
                dropdown.style.setProperty('color', '#172033', 'important');
                dropdown.style.setProperty('border', '1px solid #E2E8F0', 'important');
                dropdown.style.setProperty('box-shadow', '0 12px 30px -5px rgba(15, 23, 42, 0.18), 0 4px 12px -2px rgba(15, 23, 42, 0.1)', 'important');
            }
        }
    }

    let lastToggleTimestamp = 0;
    let eventsBound = false;

    // ==========================================
    // PUBLIC SMARTLEARN THEME API
    // Exposes methods on window.SmartLearnTheme for programmatic control.
    // ==========================================

    window.SmartLearnTheme = {
        COLOR_THEMES,

        /**
         * Returns current appearance mode setting ('light', 'dark', or 'system').
         * @returns {string} Configured appearance mode.
         */
        getAppearance() {
            return currentAppearance;
        },

        /**
         * Returns current color theme identifier ('purple', 'pink', 'orange', 'blue', 'green').
         * @returns {string} Active color theme key.
         */
        getColorTheme() {
            return currentColorTheme;
        },

        /**
         * Returns actual rendered appearance ('light' or 'dark'), resolving 'system' to OS preference.
         * @returns {'light'|'dark'} Concrete rendered mode.
         */
        getResolvedAppearance() {
            return resolveAppearanceMode(currentAppearance);
        },

        /**
         * Returns the active color palette color objects.
         * @returns {Object} Palette object containing primary, secondary, accent, and gradient values.
         */
        getColors() {
            return COLOR_THEMES[currentColorTheme] || COLOR_THEMES.purple;
        },

        /**
         * Convenience dispatcher to set appearance or color theme based on key type.
         * @param {string} themeOptionKey - Either appearance ('light'/'dark'/'system') or color key.
         */
        selectTheme(themeOptionKey) {
            if (['light', 'dark', 'system'].includes(themeOptionKey)) {
                this.setAppearance(themeOptionKey);
            } else if (COLOR_THEMES[themeOptionKey]) {
                this.setColorTheme(themeOptionKey);
            }
        },

        /**
         * Sets and persists the appearance mode, updating DOM and storage.
         * @param {'light'|'dark'|'system'} mode - Desired mode.
         */
        setAppearance(mode) {
            if (!['light', 'dark', 'system'].includes(mode)) return;
            currentAppearance = mode;
            localStorage.setItem(STORAGE_KEY_THEME, mode);
            localStorage.setItem(STORAGE_KEY_APPEARANCE, mode);
            localStorage.setItem(LEGACY_KEY_APPEARANCE, mode);
            applyThemeToDOM(currentAppearance, currentColorTheme);
            updateUIState();
            notifyThemeChanged();
        },

        /**
         * Sets and persists the accent color theme, updating DOM and storage.
         * @param {string} theme - Color theme key ('purple', 'pink', 'orange', 'blue', 'green').
         */
        setColorTheme(theme) {
            if (!COLOR_THEMES[theme]) return;
            currentColorTheme = theme;
            localStorage.setItem(STORAGE_KEY_THEME, theme);
            localStorage.setItem(STORAGE_KEY_COLOR, theme);
            localStorage.setItem(STORAGE_KEY_BRAND, theme);
            localStorage.setItem(LEGACY_KEY_COLOR, theme);
            applyThemeToDOM(currentAppearance, currentColorTheme);
            updateUIState();
            notifyThemeChanged();
        },

        /**
         * Toggles the theme popover visibility with debounced click protection.
         * @param {HTMLElement} [triggerBtn] - Button element triggering toggle.
         */
        toggleDropdown(triggerBtn) {
            const now = Date.now();
            if (now - lastToggleTimestamp < 200) {
                return;
            }
            lastToggleTimestamp = now;

            const dropdown = ensureDropdownInDOM();
            if (!dropdown) return;

            if (isDropdownVisible()) {
                this.closeDropdown();
            } else {
                this.openDropdown(triggerBtn);
            }
        },

        /**
         * Opens and positions the theme popover card.
         * @param {HTMLElement} [triggerBtn] - Trigger element reference.
         */
        openDropdown(triggerBtn) {
            const dropdown = ensureDropdownInDOM();
            if (!dropdown) return;

            formatThemeButtons();
            positionDropdown(triggerBtn);
            dropdown.classList.add('open');
            dropdown.style.setProperty('display', 'flex', 'important');
            dropdown.style.setProperty('flex-direction', 'column', 'important');
            updateUIState();
        },

        /**
         * Hides the theme popover card and updates accessibility attributes.
         */
        closeDropdown() {
            const dropdown = document.getElementById('smartlearnThemeDropdown');
            if (dropdown) {
                dropdown.classList.remove('open');
                dropdown.style.setProperty('display', 'none', 'important');
            }
            updateUIState();
        },

        /**
         * Alias for toggleDropdown to maintain backward compatibility.
         * @param {HTMLElement} [triggerBtn] - Trigger element reference.
         */
        openModal(triggerBtn) {
            this.toggleDropdown(triggerBtn);
        },

        /**
         * Initializes the theme UI elements, buttons, and listeners on page ready.
         */
        initUI() {
            ensureDropdownInDOM();
            formatThemeButtons();
            updateUIState();
            bindThemeEvents();
        }
    };

    // Legacy window global function hooks
    window.openThemeAppearanceModal = function(btn) {
        window.SmartLearnTheme.toggleDropdown(btn);
    };

    window.openThemeAppearance = function(btn) {
        window.SmartLearnTheme.toggleDropdown(btn);
    };

    // ==========================================
    // EVENT LISTENERS & KEYBOARD ACCESSIBILITY
    // Handles outside clicks, ESC key dismissal, and window resizing.
    // ==========================================

    /**
     * Binds document event listeners for theme popover opening, selecting, and dismissing.
     */
    function bindThemeEvents() {
        if (eventsBound) return;
        eventsBound = true;

        const handleGlobalClick = (e) => {
            const modalBtn = e.target.closest('#themePaletteButton') || 
                             e.target.closest('.theme-palette-button') ||
                             e.target.closest('[data-open-theme-modal]') ||
                             e.target.closest('.theme-palette-btn') ||
                             e.target.closest('#themeModalToggle') ||
                             e.target.closest('[data-action="open-theme"]');

            if (modalBtn) {
                e.preventDefault();
                e.stopPropagation();
                window.SmartLearnTheme.toggleDropdown(modalBtn);
                return;
            }

            const themeOpt = e.target.closest('#smartlearnThemeDropdown .custom-theme-card') ||
                             e.target.closest('#smartlearnThemeDropdown .custom-theme-item') || 
                             e.target.closest('.custom-theme-card') || 
                             e.target.closest('.custom-theme-item') || 
                             e.target.closest('.theme-option') || 
                             e.target.closest('[data-theme-option]');
            if (themeOpt) {
                e.preventDefault();
                e.stopPropagation();
                const appOpt = themeOpt.getAttribute('data-appearance-option');
                const colorOpt = themeOpt.getAttribute('data-color-option');
                const optionKey = appOpt || colorOpt || themeOpt.getAttribute('data-theme') || themeOpt.getAttribute('data-theme-option');

                if (appOpt || ['light', 'dark', 'system'].includes(optionKey)) {
                    window.SmartLearnTheme.setAppearance(optionKey);
                } else if (colorOpt || COLOR_THEMES[optionKey]) {
                    window.SmartLearnTheme.setColorTheme(optionKey);
                } else {
                    window.SmartLearnTheme.selectTheme(optionKey);
                }
                window.SmartLearnTheme.closeDropdown();
                return;
            }

            // Click outside dropdown closes it
            const dropdown = document.getElementById('smartlearnThemeDropdown');
            if (dropdown && isDropdownVisible()) {
                if (!dropdown.contains(e.target)) {
                    window.SmartLearnTheme.closeDropdown();
                }
            }
        };

        document.addEventListener('click', handleGlobalClick, true);

        // Escape key closes open popover
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                window.SmartLearnTheme.closeDropdown();
            }
        });

        // Window resize recalculates coordinates if open
        window.addEventListener('resize', () => {
            formatThemeButtons();
            if (isDropdownVisible()) {
                positionDropdown();
            }
        });
    }

    bindThemeEvents();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.SmartLearnTheme.initUI();
        });
    } else {
        window.SmartLearnTheme.initUI();
    }
})();
