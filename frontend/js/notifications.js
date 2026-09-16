/**
 * SmartLearn Notification Manager
 * Real-time WebSocket + Desktop Browser Notifications + In-App Toast + Dynamic Bell Badge + Dropdown Popover
 */

(function () {
    'use strict';

    class SmartLearnNotificationManager {
        constructor() {
            this.ws = null;
            this.reconnectTimer = null;
            this.pingTimer = null;
            this.notifications = [];
            this.unreadCount = 0;
            this.dropdownOpen = false;

            this.init();
        }

        async init() {
            // Check auth token
            if (typeof window.api === 'undefined' || !window.api.getToken()) {
                return;
            }

            // Request Browser Desktop Notification permission
            this.requestDesktopPermission();

            // Setup WebSocket
            this.connectWebSocket();

            // Initial fetch of unread count & recent notifications
            await this.refreshNotifications();

            // Attach Topbar Bell & Dropdown Listeners
            this.setupHeaderBellAndDropdown();

            // Setup Full Notifications Page if on notifications.html
            if (window.location.pathname.toLowerCase().includes('notifications.html')) {
                this.setupNotificationPage();
            }
        }

        // --- BROWSER DESKTOP NOTIFICATIONS ---

        requestDesktopPermission() {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().catch(() => {});
            }
        }

        showDesktopNotification(data) {
            if (!('Notification' in window) || Notification.permission !== 'granted') {
                return;
            }

            try {
                const title = data.title || 'SmartLearn Notification';
                const options = {
                    body: data.message || 'You have a new update.',
                    icon: '../css/favicon.ico', // fallback
                    tag: `smartlearn-notif-${data.id || Date.now()}`,
                    renotify: true
                };

                const notif = new Notification(title, options);
                notif.onclick = (e) => {
                    e.preventDefault();
                    window.focus();
                    if (data.related_course_id) {
                        window.location.href = `course-details.html?id=${data.related_course_id}`;
                    } else {
                        window.location.href = 'notifications.html';
                    }
                };
            } catch (e) {
                console.warn('[Desktop Notification Error]', e);
            }
        }

        // --- WEBSOCKET CONNECTION ---

        connectWebSocket() {
            const token = window.api.getToken();
            if (!token) return;

            let apiHost = window.api.API_URL || 'http://127.0.0.1:8080';
            let wsProto = apiHost.startsWith('https') ? 'wss:' : 'ws:';
            let hostClean = apiHost.replace(/^https?:\/\//, '');

            const wsUrl = `${wsProto}//${hostClean}/ws/notifications?token=${encodeURIComponent(token)}`;

            try {
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    console.log('[SmartLearn Real-Time] Connected to WebSocket Notification Server');
                    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

                    // Start Heartbeat Ping every 25s
                    this.pingTimer = setInterval(() => {
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.ws.send('ping');
                        }
                    }, 25000);
                };

                this.ws.onmessage = (event) => {
                    try {
                        const payload = JSON.parse(event.data);
                        if (payload.type === 'NOTIFICATION' && payload.data) {
                            this.handleRealTimeNotification(payload.data);
                        }
                    } catch (_) {}
                };

                this.ws.onclose = () => {
                    if (this.pingTimer) clearInterval(this.pingTimer);
                    // Reconnect backoff after 5 seconds
                    this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 5000);
                };

                this.ws.onerror = () => {
                    if (this.ws) this.ws.close();
                };
            } catch (err) {
                console.warn('[WebSocket Init Error]', err);
            }
        }

        handleRealTimeNotification(data) {
            // Update unread count
            this.unreadCount = (data.unread_count !== undefined) ? data.unread_count : (this.unreadCount + 1);
            this.updateBellBadge();

            // Prepend notification
            this.notifications.unshift(data);

            // Show Toast Popup
            this.showInAppToast(data);

            // Show Desktop Browser Notification
            this.showDesktopNotification(data);

            // Re-render dropdown if open
            if (this.dropdownOpen) {
                this.renderDropdownContent();
            }

            // Re-render full notifications page if active
            if (window.location.pathname.toLowerCase().includes('notifications.html')) {
                this.renderFullNotificationPage();
            }
        }

        // --- IN-APP TOAST ALERT ---

        showInAppToast(data) {
            let container = document.getElementById('smartlearnToastContainer');
            if (!container) {
                container = document.createElement('div');
                container.id = 'smartlearnToastContainer';
                container.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 99999;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    max-width: 360px;
                    width: calc(100% - 40px);
                    pointer-events: none;
                `;
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            toast.style.cssText = `
                background: linear-gradient(135deg, #1E1B4B, #312E81);
                color: #FFFFFF;
                padding: 1rem 1.2rem;
                border-radius: 12px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
                border-left: 4px solid #8B5CF6;
                pointer-events: auto;
                cursor: pointer;
                display: flex;
                align-items: flex-start;
                gap: 12px;
                animation: slideInRight 0.35s ease-out;
                transition: transform 0.2s ease, opacity 0.2s ease;
            `;

            const iconClass = this.getNotificationIconClass(data.type);

            toast.innerHTML = `
                <div style="background: rgba(255,255,255,0.15); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                    <i class="${iconClass}" style="color: #A78BFA; font-size: 16px;"></i>
                </div>
                <div style="flex: 1; overflow: hidden;">
                    <strong style="font-size: 13.5px; font-weight: 700; display: block; color: #FFFFFF; margin-bottom: 2px;">${this.escapeHtml(data.title)}</strong>
                    <p style="font-size: 12px; color: #E0E7FF; margin: 0; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${this.escapeHtml(data.message)}</p>
                    <span style="font-size: 10.5px; color: #9CA3AF; margin-top: 4px; display: block;">Just now</span>
                </div>
                <button style="background: none; border: none; color: #9CA3AF; font-size: 14px; cursor: pointer; padding: 0; margin-left: 4px;" onclick="event.stopPropagation(); this.parentElement.remove();">&times;</button>
            `;

            toast.onclick = () => {
                toast.remove();
                if (data.related_course_id) {
                    window.location.href = `course-details.html?id=${data.related_course_id}`;
                } else {
                    window.location.href = 'notifications.html';
                }
            };

            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(50px)';
                setTimeout(() => toast.remove(), 250);
            }, 5500);
        }

        // --- FETCHING & REFRESHING ---

        async refreshNotifications() {
            try {
                const countRes = await window.api.getUnreadNotificationCount();
                this.unreadCount = countRes.unread_count || 0;
                this.updateBellBadge();

                const notifs = await window.api.getNotifications(20);
                this.notifications = notifs || [];
            } catch (err) {
                console.warn('[Notifications Fetch Error]', err);
            }
        }

        updateBellBadge() {
            // Target topbar notification bells across student pages
            const badgeEls = document.querySelectorAll('#topNotificationBadge, .top-notification-badge');
            badgeEls.forEach(badge => {
                if (this.unreadCount > 0) {
                    badge.style.display = 'inline-flex';
                    badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                    badge.setAttribute('title', `${this.unreadCount} unread notifications`);
                } else {
                    badge.style.display = 'none';
                    badge.textContent = '';
                }
            });
        }

        // --- HEADER BELL & DROPDOWN POPOVER ---

        setupHeaderBellAndDropdown() {
            // Target bell link/container in topbar
            const bellLinks = document.querySelectorAll('a[href="notifications.html"], .notification-bell-btn');
            
            bellLinks.forEach(bell => {
                // Style badge nicely if needed
                let badge = bell.querySelector('#topNotificationBadge');
                if (badge) {
                    badge.style.cssText = `
                        position: absolute;
                        top: -3px;
                        right: -5px;
                        background: #EF4444;
                        color: #FFFFFF;
                        font-size: 10px;
                        font-weight: 800;
                        height: 16px;
                        min-width: 16px;
                        padding: 0 4px;
                        border-radius: 9999px;
                        display: ${this.unreadCount > 0 ? 'inline-flex' : 'none'};
                        align-items: center;
                        justify-content: center;
                        border: 2px solid #FFFFFF;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
                    `;
                }

                // Attach Popover Dropdown Container to bell's parent container
                const parent = bell.parentElement;
                if (parent && !parent.querySelector('.notification-dropdown-menu')) {
                    parent.style.position = 'relative';

                    const dropdown = document.createElement('div');
                    dropdown.className = 'notification-dropdown-menu';
                    dropdown.style.cssText = `
                        display: none;
                        position: absolute;
                        top: calc(100% + 10px);
                        right: 0;
                        width: 340px;
                        background: #FFFFFF;
                        border-radius: 12px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.2);
                        border: 1px solid var(--border-light, #E5E7EB);
                        z-index: 1000;
                        overflow: hidden;
                        animation: fadeInDown 0.2s ease-out;
                    `;
                    parent.appendChild(dropdown);

                    // Toggle dropdown on bell click
                    bell.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.toggleDropdown(dropdown);
                    });
                }
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.profile-dropdown-container') && !e.target.closest('a[href="notifications.html"]') && !e.target.closest('.notification-dropdown-menu')) {
                    const dropdowns = document.querySelectorAll('.notification-dropdown-menu');
                    dropdowns.forEach(d => d.style.display = 'none');
                    this.dropdownOpen = false;
                }
            });
        }

        toggleDropdown(dropdown) {
            this.dropdownOpen = (dropdown.style.display !== 'block');
            if (this.dropdownOpen) {
                // Close other dropdowns
                document.querySelectorAll('.notification-dropdown-menu').forEach(d => d.style.display = 'none');
                dropdown.style.display = 'block';
                this.renderDropdownContent(dropdown);
            } else {
                dropdown.style.display = 'none';
            }
        }

        async renderDropdownContent(dropdown = null) {
            const container = dropdown || document.querySelector('.notification-dropdown-menu');
            if (!container) return;

            // Fetch fresh
            try {
                this.notifications = await window.api.getNotifications(5);
            } catch (_) {}

            const items = this.notifications.slice(0, 5);

            let itemsHtml = '';
            if (items.length === 0) {
                itemsHtml = `
                    <div style="padding: 2rem 1rem; text-align: center; color: var(--secondary-text, #6B7280);">
                        <i class="fa-solid fa-bell-slash" style="font-size: 24px; color: #D1D5DB; margin-bottom: 8px;"></i>
                        <p style="font-size: 13px; margin: 0;">No notifications yet</p>
                    </div>
                `;
            } else {
                itemsHtml = items.map(n => `
                    <div class="dropdown-notif-item ${n.is_read ? 'read' : 'unread'}" 
                         data-id="${n.id}" data-course-id="${n.related_course_id || ''}"
                         style="padding: 0.85rem 1rem; border-bottom: 1px solid #F3F4F6; display: flex; gap: 10px; cursor: pointer; background: ${n.is_read ? '#FFFFFF' : '#F4F0FF'}; transition: background 0.15s ease;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${this.getIconBgColor(n.type)}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                            <i class="${this.getNotificationIconClass(n.type)}" style="color: ${this.getIconColor(n.type)}; font-size: 13px;"></i>
                        </div>
                        <div style="flex: 1; overflow: hidden;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                <strong style="font-size: 12.5px; color: var(--dark-navy, #1F2937); line-height: 1.3;">${this.escapeHtml(n.title)}</strong>
                                ${!n.is_read ? '<span style="width: 6px; height: 6px; background: #8B5CF6; border-radius: 50%; flex-shrink: 0;"></span>' : ''}
                            </div>
                            <p style="font-size: 11.5px; color: #4B5563; margin: 0; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${this.escapeHtml(n.message)}</p>
                            <span style="font-size: 10px; color: #9CA3AF; margin-top: 4px; display: block;">${this.formatRelativeTime(n.created_at)}</span>
                        </div>
                    </div>
                `).join('');
            }

            container.innerHTML = `
                <div style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-light, #E5E7EB); display: flex; justify-content: space-between; align-items: center; background: #FAF9FF;">
                    <strong style="font-size: 13.5px; color: var(--dark-navy, #1F2937);">Notifications</strong>
                    ${this.unreadCount > 0 ? `<button id="dropdownMarkAllBtn" style="background: none; border: none; font-size: 11.5px; color: #7C3AED; font-weight: 600; cursor: pointer;">Mark all as read</button>` : ''}
                </div>
                <div style="max-height: 320px; overflow-y: auto;">
                    ${itemsHtml}
                </div>
                <a href="notifications.html" style="display: block; padding: 0.75rem; text-align: center; font-size: 12.5px; font-weight: 600; color: #7C3AED; text-decoration: none; background: #FAF9FF; border-top: 1px solid var(--border-light, #E5E7EB);">
                    View All Notifications &rarr;
                </a>
            `;

            // Attach Mark All listener inside dropdown
            const markAllBtn = container.querySelector('#dropdownMarkAllBtn');
            if (markAllBtn) {
                markAllBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await window.api.markAllNotificationsAsRead();
                    this.unreadCount = 0;
                    this.updateBellBadge();
                    this.renderDropdownContent(container);
                };
            }

            // Attach item click listeners
            container.querySelectorAll('.dropdown-notif-item').forEach(item => {
                item.onclick = async () => {
                    const id = item.getAttribute('data-id');
                    const courseId = item.getAttribute('data-course-id');
                    try {
                        await window.api.markNotificationAsRead(id);
                    } catch (_) {}
                    if (courseId) {
                        window.location.href = `course-details.html?id=${courseId}`;
                    } else {
                        window.location.href = 'notifications.html';
                    }
                };
            });
        }

        // --- FULL NOTIFICATIONS PAGE HANDLER (`student/notifications.html`) ---

        async setupNotificationPage() {
            const pageContainer = document.querySelector('.dashboard-content');
            if (!pageContainer) return;

            // Load initial real data
            await this.renderFullNotificationPage();
        }

        async renderFullNotificationPage() {
            const pageContainer = document.querySelector('.dashboard-content');
            if (!pageContainer) return;

            let fetchError = null;
            try {
                this.notifications = await window.api.getNotifications(50);
            } catch (err) {
                fetchError = err;
                console.error('[Notification Page Fetch Error]', err);
            }

            const unreadOnly = (this.currentFilter === 'unread');
            let filteredNotifs = this.notifications || [];
            if (unreadOnly) {
                filteredNotifs = filteredNotifs.filter(n => !n.is_read);
            }

            const unreadTotal = (this.notifications || []).filter(n => !n.is_read).length;
            this.unreadCount = unreadTotal;
            this.updateBellBadge();

            let itemsHtml = '';
            if (fetchError) {
                itemsHtml = `
                    <div style="text-align: center; padding: 3rem 2rem; background: #FEF2F2; border-radius: 14px; border: 1px solid #FCA5A5;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 38px; color: #EF4444; margin-bottom: 0.75rem;"></i>
                        <h3 style="font-size: 16px; color: #991B1B; margin: 0 0 6px;">Server Connection Error</h3>
                        <p style="font-size: 13px; color: #B91C1C; margin: 0 0 1rem;">${this.escapeHtml(fetchError.message || 'Unable to connect to SmartLearn server. Please verify backend server status.')}</p>
                        <button id="retryFetchNotifsBtn" style="background: #DC2626; color: #FFF; border: none; padding: 0.55rem 1.2rem; border-radius: 6px; font-weight: 600; cursor: pointer;">
                            <i class="fa-solid fa-rotate-right"></i> Retry Connection
                        </button>
                    </div>
                `;
            } else if (filteredNotifs.length === 0) {
                itemsHtml = `
                    <div style="text-align: center; padding: 4rem 2rem; background: #FFFFFF; border-radius: 14px; border: 1px solid var(--border-light, #E5E7EB);">
                        <i class="fa-solid fa-bell-slash" style="font-size: 40px; color: #CBD5E1; margin-bottom: 1rem;"></i>
                        <h3 style="font-size: 16px; color: var(--dark-navy, #1F2937); margin: 0 0 6px;">No Notifications Found</h3>
                        <p style="font-size: 13px; color: var(--secondary-text, #6B7280); margin: 0;">You're all caught up! Check back later for new course recommendations and updates.</p>
                    </div>
                `;
            } else {
                itemsHtml = filteredNotifs.map(n => `
                    <div class="notification-card-item ${n.is_read ? 'read' : 'unread'}" data-id="${n.id}" data-course-id="${n.related_course_id || ''}"
                         style="display: flex; gap: 1.25rem; align-items: flex-start; padding: 1.25rem; background: ${n.is_read ? '#FFFFFF' : '#F5F3FF'}; border-radius: 12px; border: 1px solid ${n.is_read ? '#E5E7EB' : '#DDD6FE'}; border-left: 5px solid ${this.getBorderColor(n.type)}; box-shadow: 0 2px 5px rgba(0,0,0,0.02); transition: all 0.2s ease; cursor: pointer;">
                        
                        <div style="width: 42px; height: 42px; border-radius: 50%; background: ${this.getIconBgColor(n.type)}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                            <i class="${this.getNotificationIconClass(n.type)}" style="color: ${this.getIconColor(n.type)}; font-size: 18px;"></i>
                        </div>

                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                                <div>
                                    <strong style="color: var(--dark-navy, #1F2937); font-size: 15px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                                        ${this.escapeHtml(n.title)}
                                        ${!n.is_read ? '<span style="font-size: 10px; background: #8B5CF6; color: #FFF; padding: 1px 7px; border-radius: 9999px; font-weight: 600;">NEW</span>' : ''}
                                    </strong>
                                </div>
                                <span style="font-size: 11.5px; color: var(--secondary-text, #6B7280); white-space: nowrap;">${this.formatRelativeTime(n.created_at)}</span>
                            </div>
                            
                            <p style="color: #4B5563; font-size: 13px; margin: 6px 0 10px; line-height: 1.5;">${this.escapeHtml(n.message)}</p>

                            <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
                                ${n.related_course_id ? `<span class="btn-action-view" style="font-size: 12px; color: #7C3AED; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-arrow-right"></i> View Course Details</span>` : ''}
                                ${!n.is_read ? `<button class="btn-mark-single-read" data-id="${n.id}" style="background: none; border: none; font-size: 11.5px; color: #6B7280; text-decoration: underline; cursor: pointer; padding: 0;">Mark as read</button>` : ''}
                                <button class="btn-delete-notif" data-id="${n.id}" style="background: none; border: none; font-size: 11.5px; color: #EF4444; cursor: pointer; padding: 0; margin-left: auto;" title="Delete notification"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                `).join('');
            }

            pageContainer.innerHTML = `
                <div class="welcome-section" style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <h1 style="font-size: 24px; font-weight: 800; color: var(--dark-navy, #1F2937); margin: 0 0 6px;">System Notifications 🔔</h1>
                        <p style="color: var(--secondary-text, #6B7280); font-size: 13.5px; margin: 0;">Stay updated on personalized course recommendations, enrollment, and learning progress.</p>
                    </div>

                    ${unreadTotal > 0 ? `
                        <button id="pageMarkAllReadBtn" style="background: linear-gradient(135deg, #7C3AED, #6D28D9); color: #FFFFFF; border: none; padding: 0.6rem 1.25rem; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.25);">
                            <i class="fa-solid fa-check-double"></i> Mark All as Read
                        </button>
                    ` : ''}
                </div>

                <!-- Filter Tabs -->
                <div style="display: flex; gap: 10px; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-light, #E5E7EB); padding-bottom: 0.75rem;">
                    <button class="notif-tab-btn ${!unreadOnly ? 'active' : ''}" id="tabAllNotifs" style="background: ${!unreadOnly ? '#7C3AED' : 'transparent'}; color: ${!unreadOnly ? '#FFF' : '#4B5563'}; border: none; padding: 0.45rem 1rem; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                        All Notifications (${this.notifications.length})
                    </button>
                    <button class="notif-tab-btn ${unreadOnly ? 'active' : ''}" id="tabUnreadNotifs" style="background: ${unreadOnly ? '#7C3AED' : 'transparent'}; color: ${unreadOnly ? '#FFF' : '#4B5563'}; border: none; padding: 0.45rem 1rem; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                        Unread (${unreadTotal})
                    </button>
                </div>

                <!-- Notification Feed -->
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    ${itemsHtml}
                </div>
            `;

            // Event Listeners for tabs & actions
            document.getElementById('retryFetchNotifsBtn')?.addEventListener('click', () => {
                this.renderFullNotificationPage();
            });

            document.getElementById('tabAllNotifs')?.addEventListener('click', () => {
                this.currentFilter = 'all';
                this.renderFullNotificationPage();
            });

            document.getElementById('tabUnreadNotifs')?.addEventListener('click', () => {
                this.currentFilter = 'unread';
                this.renderFullNotificationPage();
            });

            document.getElementById('pageMarkAllReadBtn')?.addEventListener('click', async () => {
                await window.api.markAllNotificationsAsRead();
                this.unreadCount = 0;
                this.updateBellBadge();
                await this.renderFullNotificationPage();
            });

            // Card item click listeners
            pageContainer.querySelectorAll('.notification-card-item').forEach(card => {
                const notifId = card.getAttribute('data-id');
                const courseId = card.getAttribute('data-course-id');

                card.addEventListener('click', async (e) => {
                    if (e.target.closest('.btn-mark-single-read') || e.target.closest('.btn-delete-notif')) {
                        return; // handled separately
                    }
                    try {
                        await window.api.markNotificationAsRead(notifId);
                    } catch (_) {}

                    if (courseId) {
                        window.location.href = `course-details.html?id=${courseId}`;
                    }
                });
            });

            // Single mark read buttons
            pageContainer.querySelectorAll('.btn-mark-single-read').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const notifId = btn.getAttribute('data-id');
                    await window.api.markNotificationAsRead(notifId);
                    await this.renderFullNotificationPage();
                });
            });

            // Single delete buttons
            pageContainer.querySelectorAll('.btn-delete-notif').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const notifId = btn.getAttribute('data-id');
                    if (confirm('Are you sure you want to delete this notification?')) {
                        await window.api.deleteNotification(notifId);
                        await this.renderFullNotificationPage();
                    }
                });
            });
        }

        // --- HELPER UTILITIES ---

        getNotificationIconClass(type) {
            switch (type) {
                case 'COURSE_RECOMMENDATION': return 'fa-solid fa-bullseye';
                case 'NEW_COURSE': return 'fa-solid fa-book-open';
                case 'ENROLLMENT_SUCCESS': return 'fa-solid fa-circle-check';
                case 'PAYMENT_SUCCESS': return 'fa-solid fa-credit-card';
                case 'COURSE_COMPLETION': return 'fa-solid fa-trophy';
                case 'LEARNING_REMINDER': return 'fa-solid fa-clock';
                default: return 'fa-solid fa-bell';
            }
        }

        getIconColor(type) {
            switch (type) {
                case 'COURSE_RECOMMENDATION': return '#8B5CF6';
                case 'NEW_COURSE': return '#3B82F6';
                case 'ENROLLMENT_SUCCESS': return '#10B981';
                case 'PAYMENT_SUCCESS': return '#059669';
                case 'COURSE_COMPLETION': return '#F59E0B';
                case 'LEARNING_REMINDER': return '#EC4899';
                default: return '#6366F1';
            }
        }

        getIconBgColor(type) {
            switch (type) {
                case 'COURSE_RECOMMENDATION': return '#F3E8FF';
                case 'NEW_COURSE': return '#EFF6FF';
                case 'ENROLLMENT_SUCCESS': return '#ECFDF5';
                case 'PAYMENT_SUCCESS': return '#D1FAE5';
                case 'COURSE_COMPLETION': return '#FEF3C7';
                case 'LEARNING_REMINDER': return '#FCE7F3';
                default: return '#EEF2FF';
            }
        }

        getBorderColor(type) {
            switch (type) {
                case 'COURSE_RECOMMENDATION': return '#8B5CF6';
                case 'NEW_COURSE': return '#3B82F6';
                case 'ENROLLMENT_SUCCESS': return '#10B981';
                case 'PAYMENT_SUCCESS': return '#059669';
                case 'COURSE_COMPLETION': return '#F59E0B';
                case 'LEARNING_REMINDER': return '#EC4899';
                default: return '#6366F1';
            }
        }

        formatRelativeTime(isoString) {
            if (!isoString) return 'Recently';
            try {
                const date = new Date(isoString.includes('T') ? isoString : isoString.replace(' ', 'T') + 'Z');
                const now = new Date();
                const diffSec = Math.floor((now - date) / 1000);

                if (diffSec < 60) return 'Just now';
                if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
                if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
                if (diffSec < 172800) return 'Yesterday';
                if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} days ago`;

                return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            } catch (_) {
                return isoString;
            }
        }

        escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    }

    // Auto initialize on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        window.smartLearnNotifications = new SmartLearnNotificationManager();
    });

})();
