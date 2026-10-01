/**
 * SmartLearn Real-Time Chat & Communication System Frontend Engine
 * Modern Real-Time Messaging Application Architecture
 */

(function () {
    'use strict';

    let currentUser = null;
    let currentToken = null;
    let ws = null;
    let conversations = [];
    let activeConvId = null;
    let activeMessages = [];
    let allowedContacts = [];
    let pendingAttachments = []; // Array of attachment objects
    let replyState = null;      // Message object being replied to
    let editingMsgState = null; // Message object being edited
    let typingTimeout = null;
    let notificationSound = null;

    // Deduplication set for notifications to prevent duplicate alerts for the same message ID
    let processedNotificationIds = new Set();
    let selectedMsgIds = new Set();

    // --- CATEGORY & FILTER STATE ---
    let activeCategory = 'chats'; // 'chats', 'unread', 'groups', 'personal'
    let searchQuery = '';

    // Persistent Pinned & Muted lists from localStorage
    let pinnedConvs = new Set(JSON.parse(localStorage.getItem('smartlearn_pinned_chats') || '[]'));
    let mutedConvs = new Set(JSON.parse(localStorage.getItem('smartlearn_muted_chats') || '[]'));

    document.addEventListener('DOMContentLoaded', () => {
        initChatApp();
    });

    async function initChatApp() {
        currentUser = window.api ? window.api.getCurrentUser() : null;
        currentToken = window.api ? window.api.getToken() : null;

        if (!currentUser || !currentToken) {
            console.warn('[Chat] No authenticated user found.');
            return;
        }

        try {
            notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        } catch (_) {}

        setupDOMEvents();
        setupDesktopNotifications();
        connectWebSocket();
        await loadConversations();
        await loadAllowedContacts();

        // Automatically open target conversation if specified in URL query params
        const urlParams = new URLSearchParams(window.location.search);
        const targetConvId = urlParams.get('conv_id');
        if (targetConvId) {
            const cid = parseInt(targetConvId, 10);
            if (cid && conversations.some(c => c.id === cid)) {
                openConversation(cid);
            }
        }
    }

    // --- WEBSOCKET REAL-TIME ENGINE ---

    function connectWebSocket() {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || '127.0.0.1';
        const wsUrl = `${proto}//${host}:8080/chat/ws?token=${encodeURIComponent(currentToken)}`;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('[ChatWS] Connected successfully.');
            };

            ws.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    handleWSEvent(payload);
                } catch (e) {
                    console.error('[ChatWS] Message parse error:', e);
                }
            };

            ws.onclose = () => {
                console.warn('[ChatWS] Disconnected. Reconnecting in 4 seconds...');
                setTimeout(connectWebSocket, 4000);
            };

            ws.onerror = (err) => {
                console.error('[ChatWS] Error:', err);
            };
        } catch (e) {
            console.error('[ChatWS] Init error:', e);
        }
    }

    function handleWSEvent(payload) {
        const { type, data } = payload;

        if (type === 'NEW_MESSAGE') {
            console.log("Notification permission:", Notification.permission);
            console.log("Current user:", currentUser?.id);
            console.log("Message sender:", data?.sender_id);
            console.log("Message conversation:", data?.conversation_id);
            console.log("Active conversation:", activeConvId);
            console.log("Visibility:", document.visibilityState);

            const isCurrentConv = activeConvId && data.conversation_id === activeConvId;
            const isTabVisible = document.visibilityState === 'visible' && !document.hidden;
            const isOwnMessage = currentUser && String(data.sender_id) === String(currentUser.id);

            // 1. Render message live if it belongs to current active conversation
            if (isCurrentConv) {
                if (!activeMessages.find(m => m.id === data.id)) {
                    activeMessages.push(data);
                    renderMessages(activeMessages);
                    scrollToBottom();
                    if (isTabVisible) {
                        window.api.markConversationRead(activeConvId);
                    }
                }
            }

            // 2. Trigger Notification if not own message, conversation not muted, and (not current conv OR tab is hidden/inactive)
            if (!isOwnMessage && !mutedConvs.has(data.conversation_id)) {
                const shouldNotify = !isCurrentConv || !isTabVisible;

                if (shouldNotify && !processedNotificationIds.has(data.id)) {
                    processedNotificationIds.add(data.id);

                    const settings = getNotifSettings();
                    if (settings.soundNotifs) {
                        try { if (notificationSound) notificationSound.play().catch(() => {}); } catch (_) {}
                    }

                    showDesktopNotification(
                        `SmartLearn: ${data.sender_name}`,
                        data.content || 'Sent an attachment',
                        data.conversation_id,
                        data.id,
                        data.sender_avatar
                    );
                }
            }
            loadConversations();
        } else if (type === 'MESSAGE_EDITED') {
            if (data.conversation_id === activeConvId) {
                const msg = activeMessages.find(m => m.id === data.message_id);
                if (msg) {
                    msg.content = data.new_content;
                    msg.is_edited = true;
                    renderMessages(activeMessages);
                }
            }
            loadConversations();
        } else if (type === 'MESSAGE_DELETED') {
            const { message_id, conversation_id, for_everyone, deleted_for_user_id } = data;
            if (conversation_id === activeConvId) {
                if (for_everyone) {
                    const msg = activeMessages.find(m => m.id === message_id);
                    if (msg) {
                        msg.content = 'This message was deleted';
                        msg.is_deleted = true;
                        msg.deleted_for_everyone = true;
                        msg.attachments = [];
                        msg.reactions = [];
                        msg.reply_to_message = null;
                    }
                    renderMessages(activeMessages);
                } else {
                    if (currentUser && String(deleted_for_user_id) === String(currentUser.id)) {
                        activeMessages = activeMessages.filter(m => m.id !== message_id);
                        renderMessages(activeMessages);
                    }
                }
            }
            loadConversations();
            if (document.getElementById('chatSharedPanel')) {
                window.openSharedContentPanel(activeConvId, activeSharedTab);
            }
        } else if (type === 'REACTION_UPDATED') {
            if (data.conversation_id === activeConvId) {
                loadActiveMessages(activeConvId);
            }
        } else if (type === 'TYPING_STATUS') {
            if (data.conversation_id === activeConvId) {
                const typingEl = document.getElementById('chatTypingIndicator');
                if (typingEl) {
                    if (data.is_typing) {
                        typingEl.style.display = 'block';
                        typingEl.textContent = `${data.user_name} is typing...`;
                    } else {
                        typingEl.style.display = 'none';
                    }
                }
            }
        } else if (type === 'USER_PRESENCE') {
            loadConversations();
        }
    }

    // --- DATA LOADING & RENDERING ---

    async function loadConversations() {
        try {
            conversations = await window.api.getConversations();
            renderConversationsList(conversations);
            updateGlobalUnreadBadge();
        } catch (err) {
            console.error('[Chat] Error loading conversations:', err);
        }
    }

    async function loadAllowedContacts() {
        try {
            allowedContacts = await window.api.getAllowedContacts();
        } catch (err) {
            console.error('[Chat] Error loading contacts:', err);
        }
    }

    function updateGlobalUnreadBadge() {
        const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
        const navBadges = document.querySelectorAll('#chatUnreadBadge, .chat-unread-nav-badge');
        navBadges.forEach(b => {
            if (totalUnread > 0) {
                b.textContent = totalUnread > 99 ? '99+' : totalUnread;
                b.style.display = 'inline-block';
            } else {
                b.style.display = 'none';
            }
        });
    }

    function updateCategoryBadges() {
        const unreadTotal = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
        const groupsUnread = conversations.filter(c => c.type === 'COURSE_GROUP' || c.type === 'CUSTOM_GROUP').reduce((acc, c) => acc + (c.unread_count || 0), 0);
        const personalUnread = conversations.filter(c => c.type === 'PERSONAL').reduce((acc, c) => acc + (c.unread_count || 0), 0);

        const badgeUnread = document.getElementById('catUnreadBadge');
        const badgeGroups = document.getElementById('catGroupsBadge');
        const badgePersonal = document.getElementById('catPersonalBadge');

        if (badgeUnread) {
            badgeUnread.textContent = unreadTotal > 99 ? '99+' : unreadTotal;
            badgeUnread.style.display = unreadTotal > 0 ? 'inline-block' : 'none';
        }

        if (badgeGroups) {
            badgeGroups.textContent = groupsUnread > 99 ? '99+' : groupsUnread;
            badgeGroups.style.display = groupsUnread > 0 ? 'inline-block' : 'none';
        }

        if (badgePersonal) {
            badgePersonal.textContent = personalUnread > 99 ? '99+' : personalUnread;
            badgePersonal.style.display = personalUnread > 0 ? 'inline-block' : 'none';
        }
    }

    function renderEmptyState(messageSub = 'Click "New Chat" to start messaging.') {
        return `
            <div style="padding: 2.5rem 1rem; text-align: center; color: #94A3B8;">
                <i class="fa-solid fa-comments" style="font-size: 2.25rem; color: #CBD5E1; margin-bottom: 0.5rem;"></i>
                <p style="font-size: 0.85rem; color: #64748B; font-weight: 500;">${escapeHTML(messageSub)}</p>
            </div>
        `;
    }

    function renderConversationsList(convList) {
        const container = document.getElementById('chatConvListContainer');
        if (!container) return;

        updateCategoryBadges();

        let filtered = convList || [];
        if (searchQuery) {
            filtered = filtered.filter(c => {
                const titleMatch = (c.title || '').toLowerCase().includes(searchQuery);
                const msgMatch = c.last_message && (c.last_message.content || '').toLowerCase().includes(searchQuery);
                const nameMatch = c.other_user && (c.other_user.full_name || '').toLowerCase().includes(searchQuery);
                return titleMatch || msgMatch || nameMatch;
            });
        }

        let html = '';

        if (activeCategory === 'chats') {
            const pinned = filtered.filter(c => pinnedConvs.has(c.id));
            const recent = filtered.filter(c => !pinnedConvs.has(c.id));

            if (pinned.length === 0 && recent.length === 0) {
                container.innerHTML = renderEmptyState('No conversations found.');
                return;
            }

            if (pinned.length > 0) {
                html += `<div class="chat-section-label"><i class="fa-solid fa-thumbtack chat-pin-badge"></i> PINNED</div>`;
                pinned.forEach(c => html += buildConvItemHTML(c));
            }

            if (recent.length > 0) {
                if (pinned.length > 0) {
                    html += `<div class="chat-section-label"><i class="fa-solid fa-clock-rotate-left"></i> RECENT</div>`;
                }
                recent.forEach(c => html += buildConvItemHTML(c));
            }

        } else if (activeCategory === 'unread') {
            const unreadList = filtered.filter(c => c.unread_count > 0);
            if (unreadList.length === 0) {
                container.innerHTML = `
                    <div style="padding: 2.5rem 1rem; text-align: center; color: #94A3B8;">
                        <i class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: #10B981; margin-bottom: 0.5rem;"></i>
                        <p style="font-size: 0.9rem; font-weight: 700; color: #334155; margin-bottom: 4px;">No unread messages</p>
                        <p style="font-size: 0.8rem; color: #64748B;">You're all caught up!</p>
                    </div>
                `;
                return;
            }
            html += `<div class="chat-section-label"><i class="fa-solid fa-envelope-open-text"></i> UNREAD MESSAGES (${unreadList.length})</div>`;
            unreadList.forEach(c => html += buildConvItemHTML(c));

        } else if (activeCategory === 'groups') {
            const groupsList = filtered.filter(c => c.type === 'COURSE_GROUP' || c.type === 'CUSTOM_GROUP');
            if (groupsList.length === 0) {
                container.innerHTML = renderEmptyState('No course groups found.');
                return;
            }
            const courseGroups = groupsList.filter(c => c.type === 'COURSE_GROUP');
            const customGroups = groupsList.filter(c => c.type !== 'COURSE_GROUP');

            if (courseGroups.length > 0) {
                html += `<div class="chat-section-label"><i class="fa-solid fa-graduation-cap"></i> COURSE GROUPS (${courseGroups.length})</div>`;
                courseGroups.forEach(c => html += buildConvItemHTML(c));
            }

            if (customGroups.length > 0) {
                html += `<div class="chat-section-label"><i class="fa-solid fa-users"></i> CUSTOM GROUPS (${customGroups.length})</div>`;
                customGroups.forEach(c => html += buildConvItemHTML(c));
            }

        } else if (activeCategory === 'personal') {
            const personalList = filtered.filter(c => c.type === 'PERSONAL');
            const roleUpper = (currentUser.role || 'STUDENT').toUpperCase();

            if (roleUpper === 'INSTRUCTOR') {
                const studentsList = personalList.filter(c => c.other_user && c.other_user.role.toUpperCase() === 'STUDENT');
                const adminList = personalList.filter(c => c.other_user && c.other_user.role.toUpperCase() === 'ADMIN');

                if (studentsList.length > 0) {
                    html += `<div class="chat-section-label"><i class="fa-solid fa-user-graduate"></i> MY STUDENTS (${studentsList.length})</div>`;
                    studentsList.forEach(c => html += buildConvItemHTML(c));
                }
                if (adminList.length > 0) {
                    html += `<div class="chat-section-label"><i class="fa-solid fa-user-shield"></i> ADMINISTRATION</div>`;
                    adminList.forEach(c => html += buildConvItemHTML(c));
                }
            } else if (roleUpper === 'ADMIN') {
                const studentsList = personalList.filter(c => c.other_user && c.other_user.role.toUpperCase() === 'STUDENT');
                const instructorsList = personalList.filter(c => c.other_user && c.other_user.role.toUpperCase() === 'INSTRUCTOR');
                const adminsList = personalList.filter(c => c.other_user && c.other_user.role.toUpperCase() === 'ADMIN');

                if (studentsList.length > 0) {
                    html += `<div class="chat-section-label"><i class="fa-solid fa-user-graduate"></i> STUDENTS (${studentsList.length})</div>`;
                    studentsList.forEach(c => html += buildConvItemHTML(c));
                }
                if (instructorsList.length > 0) {
                    html += `<div class="chat-section-label"><i class="fa-solid fa-chalkboard-user"></i> INSTRUCTORS (${instructorsList.length})</div>`;
                    instructorsList.forEach(c => html += buildConvItemHTML(c));
                }
                if (adminsList.length > 0) {
                    html += `<div class="chat-section-label"><i class="fa-solid fa-user-shield"></i> ADMINS (${adminsList.length})</div>`;
                    adminsList.forEach(c => html += buildConvItemHTML(c));
                }
            } else {
                const instructorsList = personalList.filter(c => c.other_user && c.other_user.role.toUpperCase() === 'INSTRUCTOR');
                const studentsList = personalList.filter(c => c.other_user && c.other_user.role.toUpperCase() === 'STUDENT');
                const adminList = personalList.filter(c => c.other_user && c.other_user.role.toUpperCase() === 'ADMIN');

                if (instructorsList.length > 0) {
                    html += `<div class="chat-section-label"><i class="fa-solid fa-chalkboard-user"></i> INSTRUCTORS (${instructorsList.length})</div>`;
                    instructorsList.forEach(c => html += buildConvItemHTML(c));
                }
                if (studentsList.length > 0) {
                    html += `<div class="chat-section-label"><i class="fa-solid fa-users"></i> STUDENTS (${studentsList.length})</div>`;
                    studentsList.forEach(c => html += buildConvItemHTML(c));
                }
                if (adminList.length > 0) {
                    html += `<div class="chat-section-label"><i class="fa-solid fa-user-shield"></i> ADMINISTRATION</div>`;
                    adminList.forEach(c => html += buildConvItemHTML(c));
                }
            }

            const activeTargetUserIds = new Set(personalList.map(c => c.other_user ? c.other_user.id : null).filter(Boolean));
            const unmessagedContacts = allowedContacts.filter(ac => !activeTargetUserIds.has(ac.id));

            if (unmessagedContacts.length > 0) {
                let contactMatchCount = 0;
                let contactHtml = '';
                unmessagedContacts.forEach(ac => {
                    const acSearchMatch = !searchQuery || (ac.full_name || '').toLowerCase().includes(searchQuery) || (ac.role || '').toLowerCase().includes(searchQuery);
                    if (acSearchMatch) {
                        contactMatchCount++;
                        contactHtml += buildContactQuickItemHTML(ac);
                    }
                });
                if (contactMatchCount > 0) {
                    html += `<div class="chat-section-label" style="margin-top: 0.75rem;"><i class="fa-solid fa-user-plus"></i> START NEW CHAT</div>`;
                    html += contactHtml;
                }
            }

            if (!html) {
                container.innerHTML = renderEmptyState('No personal conversations available.');
                return;
            }
        }

        container.innerHTML = html;

        container.querySelectorAll('.chat-conv-item:not(.chat-contact-item)').forEach(item => {
            item.addEventListener('click', () => {
                const convId = parseInt(item.dataset.convId, 10);
                openConversation(convId);
            });
        });

        container.querySelectorAll('.chat-contact-item').forEach(item => {
            item.addEventListener('click', async () => {
                const targetUserId = parseInt(item.dataset.userId, 10);
                try {
                    const conv = await window.api.createConversation({
                        type: 'PERSONAL',
                        target_user_id: targetUserId
                    });
                    await loadConversations();
                    openConversation(conv.id);
                } catch (err) {
                    alert(err.message || 'Could not start chat.');
                }
            });
        });
    }

    function buildConvItemHTML(c) {
        const isActive = c.id === activeConvId ? 'active' : '';
        const isOnline = c.other_user ? c.other_user.is_online : false;
        const isPinned = pinnedConvs.has(c.id);
        const isMuted = mutedConvs.has(c.id);

        const avatarText = c.other_user ? getInitials(c.other_user.full_name) : (c.title ? c.title.substring(0, 2).toUpperCase() : 'GP');
        const avatarSrc = c.other_user ? c.other_user.profile_image : null;

        let lastMsgText = 'No messages yet';
        if (c.last_message) {
            if (c.last_message.content) {
                lastMsgText = c.last_message.content;
            } else if (c.last_message.attachments && c.last_message.attachments.length > 0) {
                const att = c.last_message.attachments[0];
                if (att.file_type && att.file_type.startsWith('image/')) {
                    lastMsgText = '📷 Image';
                } else {
                    lastMsgText = `📎 ${att.file_name || 'Document'}`;
                }
            } else {
                lastMsgText = 'Shared attachment';
            }
        }

        const lastMsgTime = c.last_message ? formatShortTime(c.last_message.created_at) : '';

        return `
            <div class="chat-conv-item ${isActive}" data-conv-id="${c.id}">
                <div class="chat-avatar-wrapper">
                    <div class="chat-avatar">
                        ${avatarSrc ? `<img src="${window.api.getImageUrl(avatarSrc)}" alt="${escapeHTML(c.title)}">` : avatarText}
                    </div>
                    ${c.type === 'PERSONAL' ? `<span class="${isOnline ? 'online-indicator' : 'offline-indicator'}"></span>` : ''}
                </div>
                <div class="chat-conv-info">
                    <div class="chat-conv-top">
                        <span class="chat-conv-name">
                            ${escapeHTML(c.title)}
                            ${isPinned ? `<i class="fa-solid fa-thumbtack chat-pin-badge"></i>` : ''}
                            ${isMuted ? `<i class="fa-solid fa-volume-xmark chat-mute-badge"></i>` : ''}
                        </span>
                        <span class="chat-conv-time">${lastMsgTime}</span>
                    </div>
                    <div class="chat-conv-bottom">
                        <p class="chat-conv-last-msg">${escapeHTML(lastMsgText)}</p>
                        ${c.unread_count > 0 ? `<span class="chat-unread-badge">${c.unread_count}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function buildContactQuickItemHTML(ac) {
        const initials = getInitials(ac.full_name);
        const avatarSrc = ac.profile_image;
        const roleBadge = ac.role ? ac.role.toUpperCase() : 'USER';
        const subText = ac.course_names && ac.course_names.length > 0 ? ac.course_names.join(', ') : (ac.course_title || ac.role);

        return `
            <div class="chat-conv-item chat-contact-item" data-user-id="${ac.id}" data-user-name="${escapeHTML(ac.full_name)}">
                <div class="chat-avatar-wrapper">
                    <div class="chat-avatar" style="background: linear-gradient(135deg, #8B5CF6, #6366F1);">
                        ${avatarSrc ? `<img src="${window.api.getImageUrl(avatarSrc)}" alt="${escapeHTML(ac.full_name)}">` : initials}
                    </div>
                </div>
                <div class="chat-conv-info">
                    <div class="chat-conv-top">
                        <span class="chat-conv-name">${escapeHTML(ac.full_name)}</span>
                        <span style="font-size: 0.65rem; font-weight: 700; background: #EEF2FF; color: #4F46E5; padding: 2px 6px; border-radius: 99px;">${roleBadge}</span>
                    </div>
                    <div class="chat-conv-bottom">
                        <p class="chat-conv-last-msg" style="color: #6366F1; font-weight: 500;">Start chat • ${escapeHTML(subText)}</p>
                    </div>
                </div>
            </div>
        `;
    }

    async function openConversation(convId) {
        activeConvId = convId;
        if (window.clearMessageSelection) window.clearMessageSelection();
        const appContainer = document.getElementById('chatAppContainer');
        if (appContainer) appContainer.classList.add('mobile-open');

        renderConversationsList(conversations);

        const conv = conversations.find(c => c.id === convId);
        if (conv) {
            renderChatHeader(conv);
            conv.unread_count = 0;
            updateGlobalUnreadBadge();
            updateCategoryBadges();
        }

        await loadActiveMessages(convId);
        await window.api.markConversationRead(convId);
    }

    function renderChatHeader(conv) {
        const headerTitle = document.getElementById('chatHeaderTitle');
        const headerSubtitle = document.getElementById('chatHeaderSubtitle');
        const headerAvatar = document.getElementById('chatHeaderAvatar');
        const headerLeft = document.querySelector('.chat-header-left');

        if (headerTitle) headerTitle.textContent = conv.title;
        if (headerSubtitle) {
            if (conv.type === 'COURSE_GROUP') {
                headerSubtitle.textContent = `Course Group • ${conv.members_count || 1} members`;
            } else if (conv.type === 'PERSONAL' && conv.other_user) {
                headerSubtitle.textContent = `${conv.other_user.role} • ${conv.other_user.is_online ? '🟢 Online' : '⚪ Offline'}`;
            } else {
                headerSubtitle.textContent = `${conv.type} • ${conv.members_count || 1} members`;
            }
        }
        if (headerAvatar) {
            const avatarSrc = conv.other_user ? conv.other_user.profile_image : null;
            const initials = conv.other_user ? getInitials(conv.other_user.full_name) : getInitials(conv.title);
            headerAvatar.innerHTML = avatarSrc ? `<img src="${window.api.getImageUrl(avatarSrc)}" alt="${escapeHTML(conv.title)}">` : initials;
        }

        // Attach click listener on header info/avatar area to open Contact Info Panel
        if (headerLeft) {
            headerLeft.style.cursor = 'pointer';
            headerLeft.onclick = (e) => {
                if (e.target.closest('#chatMobileBackBtn')) return;
                window.openContactInfoPanel(conv.id);
            };
        }

        const actionsContainer = document.querySelector('.chat-header-actions');
        if (actionsContainer) {
            const isPinned = pinnedConvs.has(conv.id);
            const isMuted = mutedConvs.has(conv.id);

            let actionHtml = `<span id="chatTypingIndicator" style="display: none; font-size: 0.8rem; color: #5B3FE8; font-weight: 600; margin-right: 0.5rem;"></span>`;

            actionHtml += `
                <button class="chat-action-btn" title="Search Messages" onclick="window.openSearchMessagesModal(${conv.id})">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
                <button class="chat-action-btn" title="Contact Info" onclick="window.openContactInfoPanel(${conv.id})">
                    <i class="fa-solid fa-circle-info"></i>
                </button>
                <button class="chat-action-btn" title="Media, Links and Docs" onclick="window.openSharedContentPanel(${conv.id})">
                    <i class="fa-solid fa-folder-open"></i>
                </button>
                <button class="chat-action-btn ${isPinned ? 'active' : ''}" title="${isPinned ? 'Unpin Conversation' : 'Pin Conversation'}" onclick="window.togglePinConv(${conv.id})">
                    <i class="fa-solid fa-thumbtack" style="${isPinned ? 'color:#5B3FE8;' : ''}"></i>
                </button>
                <button class="chat-action-btn" id="chatHeaderMoreBtn" title="More options" onclick="window.toggleHeaderMoreMenu(event, ${conv.id})">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
            `;

            actionsContainer.innerHTML = actionHtml;
        }
    }

    // --- PIN & MUTE HANDLERS ---
    window.togglePinConv = (convId) => {
        if (pinnedConvs.has(convId)) {
            pinnedConvs.delete(convId);
        } else {
            pinnedConvs.add(convId);
        }
        localStorage.setItem('smartlearn_pinned_chats', JSON.stringify(Array.from(pinnedConvs)));
        renderConversationsList(conversations);
        if (activeConvId === convId) {
            const conv = conversations.find(c => c.id === convId);
            if (conv) renderChatHeader(conv);
        }
    };

    window.toggleMuteConv = (convId) => {
        if (mutedConvs.has(convId)) {
            mutedConvs.delete(convId);
        } else {
            mutedConvs.add(convId);
        }
        localStorage.setItem('smartlearn_muted_chats', JSON.stringify(Array.from(mutedConvs)));
        renderConversationsList(conversations);
        if (activeConvId === convId) {
            const conv = conversations.find(c => c.id === convId);
            if (conv) renderChatHeader(conv);
        }
    };

    // --- CONTACT INFO & SHARED MEDIA PANELS ---

    let currentSharedSearch = '';
    let activeSharedTab = 'media'; // 'media', 'docs', 'links'
    let currentSharedData = null;

    window.closeChatPanels = () => {
        const p1 = document.getElementById('chatContactPanel');
        const p2 = document.getElementById('chatSharedPanel');
        if (p1) p1.remove();
        if (p2) p2.remove();
        const menu = document.getElementById('chatHeaderOptionsMenu');
        if (menu) menu.remove();
    };

    window.openContactInfoPanel = async (convId) => {
        const targetId = convId || activeConvId;
        if (!targetId) return;

        window.closeChatPanels();

        try {
            const info = await window.api.getContactInfo(targetId);
            const container = document.getElementById('chatAppContainer');
            if (!container) return;

            const panel = document.createElement('div');
            panel.id = 'chatContactPanel';
            panel.className = 'chat-contact-panel';

            const totalSharedCount = (info.media_count || 0) + (info.docs_count || 0) + (info.links_count || 0);

            panel.innerHTML = `
                <div class="panel-header">
                    <h4 class="panel-header-title"><i class="fa-solid fa-circle-info" style="color:#5B3FE8;"></i> Contact Info</h4>
                    <button class="panel-close-btn" onclick="window.closeChatPanels()">&times;</button>
                </div>
                <div class="contact-info-body">
                    <div class="contact-profile-avatar">
                        ${info.profile_image ? `<img src="${window.api.getImageUrl(info.profile_image)}" alt="${escapeHTML(info.title)}">` : getInitials(info.title)}
                    </div>
                    <div style="text-align: center;">
                        <h3 class="contact-profile-name">${escapeHTML(info.title)}</h3>
                        <span class="contact-profile-role">${escapeHTML(info.role || info.type)}</span>
                    </div>

                    <div class="contact-detail-card">
                        ${info.email ? `
                            <div class="contact-detail-row">
                                <i class="fa-solid fa-envelope"></i>
                                <div>
                                    <span class="contact-detail-label">Email</span>
                                    <span class="contact-detail-val">${escapeHTML(info.email)}</span>
                                </div>
                            </div>
                        ` : ''}

                        ${info.course_title ? `
                            <div class="contact-detail-row">
                                <i class="fa-solid fa-graduation-cap"></i>
                                <div>
                                    <span class="contact-detail-label">Course</span>
                                    <span class="contact-detail-val">${escapeHTML(info.course_title)}</span>
                                </div>
                            </div>
                        ` : ''}

                        <div class="contact-detail-row">
                            <i class="fa-solid fa-circle" style="font-size: 0.6rem; color: ${info.is_online ? '#10B981' : '#CBD5E1'};"></i>
                            <div>
                                <span class="contact-detail-label">Status</span>
                                <span class="contact-detail-val">${info.is_online ? 'Active now' : 'Offline'}</span>
                            </div>
                        </div>
                    </div>

                    <div class="contact-media-trigger-card" onclick="window.openSharedContentPanel(${targetId})">
                        <div class="trigger-card-top">
                            <span class="trigger-card-title"><i class="fa-solid fa-photo-film" style="color:#5B3FE8;"></i> Media, Links and Docs</span>
                            <span class="trigger-card-count">${totalSharedCount} <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; margin-left:2px;"></i></span>
                        </div>
                        <div style="font-size: 0.775rem; color: #64748B;">
                            ${info.media_count} Media • ${info.docs_count} Docs • ${info.links_count} Links
                        </div>
                    </div>

                    ${info.type !== 'PERSONAL' ? `
                        <div class="contact-media-trigger-card" onclick="window.viewGroupMembers(${targetId})">
                            <div class="trigger-card-top">
                                <span class="trigger-card-title"><i class="fa-solid fa-users" style="color:#5B3FE8;"></i> Group Members</span>
                                <span class="trigger-card-count">${info.members_count} <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; margin-left:2px;"></i></span>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;

            container.appendChild(panel);
        } catch (err) {
            console.error('[ContactInfo] Error:', err);
            alert('Unable to load contact information.');
        }
    };

    window.openSharedContentPanel = async (convId, initialTab = 'media') => {
        const targetId = convId || activeConvId;
        if (!targetId) return;

        window.closeChatPanels();
        activeSharedTab = initialTab;

        try {
            currentSharedData = await window.api.getSharedContent(targetId, currentSharedSearch);
            const container = document.getElementById('chatAppContainer');
            if (!container) return;

            const panel = document.createElement('div');
            panel.id = 'chatSharedPanel';
            panel.className = 'chat-shared-panel';

            panel.innerHTML = `
                <div class="panel-header">
                    <button class="panel-close-btn" title="Back to Contact Info" onclick="window.openContactInfoPanel(${targetId})"><i class="fa-solid fa-arrow-left"></i></button>
                    <h4 class="panel-header-title">Media, Links and Docs</h4>
                    <button class="panel-close-btn" title="Close" onclick="window.closeChatPanels()">&times;</button>
                </div>

                <div class="shared-content-nav-tabs">
                    <button class="shared-tab-btn ${activeSharedTab === 'media' ? 'active' : ''}" id="tabBtnMedia" onclick="window.switchSharedTab('media', ${targetId})">
                        Media (${currentSharedData.media_count})
                    </button>
                    <button class="shared-tab-btn ${activeSharedTab === 'docs' ? 'active' : ''}" id="tabBtnDocs" onclick="window.switchSharedTab('docs', ${targetId})">
                        Docs (${currentSharedData.docs_count})
                    </button>
                    <button class="shared-tab-btn ${activeSharedTab === 'links' ? 'active' : ''}" id="tabBtnLinks" onclick="window.switchSharedTab('links', ${targetId})">
                        Links (${currentSharedData.links_count})
                    </button>
                </div>

                <div class="shared-search-box">
                    <div class="chat-search-box">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input type="text" class="chat-search-input" id="sharedSearchInput" placeholder="Search shared files..." value="${escapeHTML(currentSharedSearch)}" oninput="window.handleSharedSearchInput(${targetId}, this.value)">
                    </div>
                </div>

                <div class="shared-content-body" id="sharedContentBody">
                </div>
            `;

            container.appendChild(panel);
            renderSharedContentTabBody();
        } catch (err) {
            console.error('[SharedContent] Error:', err);
            alert('Unable to load shared files. Please try again.');
        }
    };

    window.switchSharedTab = (tabName, convId) => {
        activeSharedTab = tabName;
        document.querySelectorAll('.shared-tab-btn').forEach(btn => btn.classList.remove('active'));
        if (tabName === 'media') document.getElementById('tabBtnMedia')?.classList.add('active');
        if (tabName === 'docs') document.getElementById('tabBtnDocs')?.classList.add('active');
        if (tabName === 'links') document.getElementById('tabBtnLinks')?.classList.add('active');

        renderSharedContentTabBody();
    };

    window.handleSharedSearchInput = (convId, val) => {
        currentSharedSearch = val.trim();
        clearTimeout(window._sharedSearchTimeout);
        window._sharedSearchTimeout = setTimeout(async () => {
            try {
                currentSharedData = await window.api.getSharedContent(convId, currentSharedSearch);
                document.getElementById('tabBtnMedia').textContent = `Media (${currentSharedData.media_count})`;
                document.getElementById('tabBtnDocs').textContent = `Docs (${currentSharedData.docs_count})`;
                document.getElementById('tabBtnLinks').textContent = `Links (${currentSharedData.links_count})`;
                renderSharedContentTabBody();
            } catch (_) {}
        }, 300);
    };

    function groupItemsByDate(items) {
        const groups = {};
        const now = new Date();
        const thisMonthKey = now.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();
        
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const lastMonthKey = lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();

        items.forEach(item => {
            let itemDate = item.created_at ? new Date(item.created_at) : new Date();
            if (isNaN(itemDate.getTime())) itemDate = new Date();

            const itemMonthKey = itemDate.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();

            let groupLabel = itemMonthKey;
            if (itemMonthKey === thisMonthKey) {
                groupLabel = 'THIS MONTH';
            } else if (itemMonthKey === lastMonthKey) {
                groupLabel = 'LAST MONTH';
            }

            if (!groups[groupLabel]) groups[groupLabel] = [];
            groups[groupLabel].push(item);
        });

        return groups;
    }

    function renderSharedContentTabBody() {
        const body = document.getElementById('sharedContentBody');
        if (!body || !currentSharedData) return;

        let html = '';

        if (activeSharedTab === 'media') {
            const mediaItems = currentSharedData.media || [];
            if (mediaItems.length === 0) {
                body.innerHTML = `
                    <div class="shared-empty-state">
                        <i class="fa-solid fa-photo-film"></i>
                        <h4 class="shared-empty-title">No shared media yet</h4>
                        <p class="shared-empty-desc">Images and videos shared in this conversation will appear here.</p>
                    </div>
                `;
                return;
            }

            const grouped = groupItemsByDate(mediaItems);
            Object.keys(grouped).forEach(dateLabel => {
                html += `<div class="shared-date-group-header">${dateLabel}</div>`;
                html += `<div class="shared-media-grid">`;
                grouped[dateLabel].forEach(m => {
                    const isVideo = m.file_type && m.file_type.startsWith('video/');
                    const url = window.api.getImageUrl(m.file_path);
                    if (isVideo) {
                        html += `
                            <div class="shared-media-card" onclick="window.showVideoLightbox('${url}', '${escapeHTML(m.file_name)}')">
                                <video src="${url}#t=0.5" preload="metadata"></video>
                                <span class="shared-media-type-badge"><i class="fa-solid fa-play"></i></span>
                            </div>
                        `;
                    } else {
                        html += `
                            <div class="shared-media-card" onclick="window.showImageLightbox('${url}', '${escapeHTML(m.file_name)}')">
                                <img src="${url}" alt="${escapeHTML(m.file_name)}" loading="lazy">
                            </div>
                        `;
                    }
                });
                html += `</div>`;
            });

        } else if (activeSharedTab === 'docs') {
            const docItems = currentSharedData.docs || [];
            if (docItems.length === 0) {
                body.innerHTML = `
                    <div class="shared-empty-state">
                        <i class="fa-solid fa-file-lines"></i>
                        <h4 class="shared-empty-title">No documents yet</h4>
                        <p class="shared-empty-desc">Documents shared in this conversation will appear here.</p>
                    </div>
                `;
                return;
            }

            const grouped = groupItemsByDate(docItems);
            Object.keys(grouped).forEach(dateLabel => {
                html += `<div class="shared-date-group-header">${dateLabel}</div>`;
                html += `<div class="shared-docs-list">`;
                grouped[dateLabel].forEach(d => {
                    const iconConfig = getDocIconConfig(d.file_name, d.file_type);
                    const url = window.api.getImageUrl(d.file_path);
                    const dateFormatted = d.created_at ? formatDateSeparator(d.created_at) : '';

                    html += `
                        <div class="shared-doc-card">
                            <i class="${iconConfig.icon} doc-type-icon" style="color: ${iconConfig.color}; background: ${iconConfig.bg};"></i>
                            <div class="shared-doc-info">
                                <span class="shared-doc-name">${escapeHTML(d.file_name)}</span>
                                <div class="shared-doc-meta">${formatFileSize(d.file_size)} • Shared by ${escapeHTML(d.sender_name)} ${dateFormatted ? '• ' + dateFormatted : ''}</div>
                            </div>
                            <div class="shared-doc-actions">
                                <a href="${url}" target="_blank" class="doc-btn" title="Open/Preview"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open</a>
                                <a href="${url}" download="${escapeHTML(d.file_name)}" class="doc-btn" title="Download"><i class="fa-solid fa-download"></i></a>
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;
            });

        } else if (activeSharedTab === 'links') {
            const linkItems = currentSharedData.links || [];
            if (linkItems.length === 0) {
                body.innerHTML = `
                    <div class="shared-empty-state">
                        <i class="fa-solid fa-link"></i>
                        <h4 class="shared-empty-title">No links yet</h4>
                        <p class="shared-empty-desc">Links shared in this conversation will appear here.</p>
                    </div>
                `;
                return;
            }

            const grouped = groupItemsByDate(linkItems);
            Object.keys(grouped).forEach(dateLabel => {
                html += `<div class="shared-date-group-header">${dateLabel}</div>`;
                html += `<div class="shared-links-list">`;
                grouped[dateLabel].forEach(l => {
                    const dateFormatted = l.created_at ? formatDateSeparator(l.created_at) : '';
                    html += `
                        <a href="${escapeHTML(l.url)}" target="_blank" rel="noopener noreferrer" class="shared-link-card">
                            <div class="link-icon-box"><i class="fa-solid fa-link"></i></div>
                            <div class="link-card-info">
                                <span class="link-url-text">${escapeHTML(l.title || l.url)}</span>
                                <div style="font-size: 0.775rem; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(l.url)}</div>
                                <div class="link-meta-text">Shared by ${escapeHTML(l.sender_name)} ${dateFormatted ? '• ' + dateFormatted : ''}</div>
                            </div>
                        </a>
                    `;
                });
                html += `</div>`;
            });
        }

        body.innerHTML = html;
    }

    function getDocIconConfig(filename, filetype) {
        const ext = filename && filename.includes('.') ? filename.split('.').pop().toLowerCase() : (filetype || '').toLowerCase();

        if (['pdf'].includes(ext)) return { icon: 'fa-solid fa-file-pdf', color: '#EF4444', bg: '#FEF2F2' };
        if (['doc', 'docx'].includes(ext)) return { icon: 'fa-solid fa-file-word', color: '#2563EB', bg: '#EFF6FF' };
        if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'fa-solid fa-file-excel', color: '#16A34A', bg: '#F0FDF4' };
        if (['ppt', 'pptx'].includes(ext)) return { icon: 'fa-solid fa-file-powerpoint', color: '#EA580C', bg: '#FFF7ED' };
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { icon: 'fa-solid fa-file-zipper', color: '#8B5CF6', bg: '#F5F3FF' };
        if (['py', 'js', 'html', 'css', 'json', 'c', 'cpp', 'java'].includes(ext)) return { icon: 'fa-solid fa-file-code', color: '#5B3FE8', bg: '#F3EEFF' };
        return { icon: 'fa-solid fa-file-lines', color: '#64748B', bg: '#F8FAFC' };
    }

    // --- LIGHTBOX MODALS ---
    window.showImageLightbox = (imageUrl, fileName) => {
        const existing = document.getElementById('lightboxModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'lightboxModal';
        modal.className = 'lightbox-modal';
        modal.onclick = () => modal.remove();

        modal.innerHTML = `
            <div class="lightbox-header">
                <span style="font-size: 0.95rem; font-weight: 700; color: #FFFFFF;">${escapeHTML(fileName || 'Image Preview')}</span>
                <div style="display: flex; gap: 0.85rem; align-items: center;">
                    <a href="${imageUrl}" download="${escapeHTML(fileName || 'media')}" target="_blank" onclick="event.stopPropagation()" style="color:#FFFFFF; font-size:1.1rem; text-decoration:none;"><i class="fa-solid fa-download"></i></a>
                    <button onclick="document.getElementById('lightboxModal').remove()" style="background:none; border:none; color:#FFFFFF; font-size:1.5rem; cursor:pointer;">&times;</button>
                </div>
            </div>
            <img src="${imageUrl}" class="lightbox-content" onclick="event.stopPropagation()">
        `;

        document.body.appendChild(modal);
    };

    window.showVideoLightbox = (videoUrl, fileName) => {
        const existing = document.getElementById('lightboxModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'lightboxModal';
        modal.className = 'lightbox-modal';
        modal.onclick = () => modal.remove();

        modal.innerHTML = `
            <div class="lightbox-header">
                <span style="font-size: 0.95rem; font-weight: 700; color: #FFFFFF;">${escapeHTML(fileName || 'Video Preview')}</span>
                <div style="display: flex; gap: 0.85rem; align-items: center;">
                    <a href="${videoUrl}" download="${escapeHTML(fileName || 'video')}" target="_blank" onclick="event.stopPropagation()" style="color:#FFFFFF; font-size:1.1rem; text-decoration:none;"><i class="fa-solid fa-download"></i></a>
                    <button onclick="document.getElementById('lightboxModal').remove()" style="background:none; border:none; color:#FFFFFF; font-size:1.5rem; cursor:pointer;">&times;</button>
                </div>
            </div>
            <video src="${videoUrl}" controls autoplay class="lightbox-content" style="max-width:85vw; max-height:85vh; border-radius:12px;" onclick="event.stopPropagation()"></video>
        `;

        document.body.appendChild(modal);
    };

    // --- 3-DOT HEADER MORE MENU ---
    window.toggleHeaderMoreMenu = (event, convId) => {
        event.stopPropagation();
        const existing = document.getElementById('chatHeaderOptionsMenu');
        if (existing) {
            existing.remove();
            return;
        }

        const menu = document.createElement('div');
        menu.id = 'chatHeaderOptionsMenu';
        menu.className = 'chat-options-menu';

        const isPinned = pinnedConvs.has(convId);
        const isMuted = mutedConvs.has(convId);

        menu.innerHTML = `
            <div class="chat-option-item" onclick="window.openContactInfoPanel(${convId}); window.closeHeaderMoreMenu();">
                <i class="fa-solid fa-circle-info"></i> Contact Info
            </div>
            <div class="chat-option-item" onclick="window.openSearchMessagesModal(${convId}); window.closeHeaderMoreMenu();">
                <i class="fa-solid fa-magnifying-glass"></i> Search Messages
            </div>
            <div class="chat-option-item" onclick="window.openSharedContentPanel(${convId}); window.closeHeaderMoreMenu();">
                <i class="fa-solid fa-photo-film"></i> Media, Links and Docs
            </div>
            <div class="chat-option-item" onclick="window.togglePinConv(${convId}); window.closeHeaderMoreMenu();">
                <i class="fa-solid fa-thumbtack"></i> ${isPinned ? 'Unpin Chat' : 'Pin Chat'}
            </div>
            <div class="chat-option-item" onclick="window.toggleMuteConv(${convId}); window.closeHeaderMoreMenu();">
                <i class="fa-solid ${isMuted ? 'fa-volume-high' : 'fa-volume-xmark'}"></i> ${isMuted ? 'Unmute Notifications' : 'Mute Notifications'}
            </div>
            <div class="chat-option-item text-danger" style="color:#EF4444;" onclick="window.confirmClearChat(${convId}); window.closeHeaderMoreMenu();">
                <i class="fa-solid fa-trash" style="color:#EF4444;"></i> Clear Chat
            </div>
        `;

        const headerActions = document.querySelector('.chat-header-actions');
        if (headerActions) {
            headerActions.appendChild(menu);
        } else {
            document.body.appendChild(menu);
        }

        setTimeout(() => {
            document.addEventListener('click', window.closeHeaderMoreMenu, { once: true });
        }, 10);
    };

    window.closeHeaderMoreMenu = () => {
        const menu = document.getElementById('chatHeaderOptionsMenu');
        if (menu) menu.remove();
    };

    window.confirmClearChat = async (convId) => {
        if (confirm('Are you sure you want to clear chat history for this conversation?')) {
            try {
                await window.api.clearConversation(convId);
                await loadActiveMessages(convId);
                await loadConversations();
            } catch (err) {
                alert(err.message || 'Failed to clear chat.');
            }
        }
    };

    window.openSearchMessagesModal = (convId) => {
        const existing = document.getElementById('searchMsgsModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'searchMsgsModal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(2px);
            display: flex; align-items: center; justify-content: center; z-index: 100000;
        `;

        modal.innerHTML = `
            <div style="background: #FFFFFF; border-radius: 16px; width: 90%; max-width: 500px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15); border: 1px solid #E2E8F0;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; border-bottom: 1px solid #E2E8F0; padding-bottom: 0.75rem;">
                    <h3 style="font-size: 1.1rem; font-weight: 800; color: #0F172A; margin: 0;">Search Messages</h3>
                    <button onclick="document.getElementById('searchMsgsModal').remove()" style="background: #F1F5F9; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: 1.1rem; cursor: pointer; color: #64748B;">&times;</button>
                </div>

                <div class="chat-search-box" style="margin-bottom: 1rem;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" class="chat-search-input" id="searchMsgsModalInput" placeholder="Type to search in conversation..." autofocus>
                </div>

                <div id="searchMsgsResults" style="max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
                    <p style="text-align: center; color: #64748B; font-size: 0.85rem; padding: 1rem;">Enter a query to search messages.</p>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = document.getElementById('searchMsgsModalInput');
        const resultsBox = document.getElementById('searchMsgsResults');

        input.addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            if (!q) {
                resultsBox.innerHTML = `<p style="text-align: center; color: #64748B; font-size: 0.85rem; padding: 1rem;">Enter a query to search messages.</p>`;
                return;
            }

            const matches = activeMessages.filter(m => m.content && m.content.toLowerCase().includes(q));
            if (matches.length === 0) {
                resultsBox.innerHTML = `<p style="text-align: center; color: #64748B; font-size: 0.85rem; padding: 1rem;">No matching messages found.</p>`;
                return;
            }

            let resHtml = '';
            matches.forEach(m => {
                resHtml += `
                    <div onclick="window.scrollToOriginalMessage(${m.id}); document.getElementById('searchMsgsModal').remove();" style="padding: 0.65rem 0.85rem; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; cursor: pointer; transition: background 0.15s ease;" onmouseover="this.style.background='#F3EEFF'" onmouseout="this.style.background='#F8FAFC'">
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #64748B; margin-bottom: 2px;">
                            <strong style="color: #5B3FE8;">${escapeHTML(m.sender_name)}</strong>
                            <span>${formatTime(m.created_at)}</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #172033;">${escapeHTML(m.content)}</div>
                    </div>
                `;
            });
            resultsBox.innerHTML = resHtml;
        });
    };

    window.viewGroupMembers = async (groupId) => {
        try {
            const groupData = await window.api.getGroupMembers(groupId);
            showGroupMembersModal(groupData);
        } catch (err) {
            alert(err.message || 'Could not load group members.');
        }
    };

    function showGroupMembersModal(data) {
        const existing = document.getElementById('groupMembersModal');
        if (existing) existing.remove();

        let html = `
            <div class="modal-overlay" id="groupMembersModal" style="position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 1000;">
                <div style="background: #FFFFFF; border-radius: 16px; width: 90%; max-width: 480px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15); border: 1px solid #E2E8F0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; border-bottom: 1px solid #E2E8F0; padding-bottom: 0.75rem;">
                        <div>
                            <h3 style="font-size: 1.15rem; font-weight: 800; color: #0F172A; margin: 0;">${escapeHTML(data.title)}</h3>
                            <span style="font-size: 0.8rem; color: #64748B;">Group Members • ${data.total_members} Total</span>
                        </div>
                        <button onclick="document.getElementById('groupMembersModal').remove()" style="background: #F1F5F9; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: 1.1rem; cursor: pointer; color: #64748B;">&times;</button>
                    </div>

                    ${data.instructor ? `
                        <div style="background: #EEF2FF; border-left: 4px solid #6366F1; padding: 0.65rem 0.85rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.85rem; color: #1E293B;">
                            <strong>Course Instructor:</strong> ${escapeHTML(data.instructor.full_name)} (${escapeHTML(data.instructor.email)})
                        </div>
                    ` : ''}

                    <div style="max-height: 340px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
        `;

        data.members.forEach(m => {
            const roleBadgeColor = m.role.toLowerCase() === 'instructor' ? '#4F46E5' : (m.role.toLowerCase() === 'admin' ? '#EF4444' : '#10B981');
            html += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0.75rem; border-radius: 10px; background: #F8FAFC; border: 1px solid #F1F5F9;">
                    <div style="display: flex; align-items: center; gap: 0.65rem;">
                        <div class="chat-avatar" style="width: 34px; height: 34px; font-size: 0.8rem;">
                            ${m.profile_image ? `<img src="${window.api.getImageUrl(m.profile_image)}" alt="${escapeHTML(m.full_name)}">` : getInitials(m.full_name)}
                        </div>
                        <div>
                            <strong style="font-size: 0.875rem; color: #0F172A; display: block;">${escapeHTML(m.full_name)}</strong>
                            <span style="font-size: 0.75rem; color: #64748B;">${escapeHTML(m.email)}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 0.675rem; font-weight: 800; color: ${roleBadgeColor}; background: rgba(0,0,0,0.04); padding: 0.2rem 0.55rem; border-radius: 9999px;">${m.role.toUpperCase()}</span>
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${m.is_online ? '#10B981' : '#CBD5E1'};" title="${m.is_online ? 'Online' : 'Offline'}"></span>
                    </div>
                </div>
            `;
        });

        html += `
                    </div>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    }

    async function loadActiveMessages(convId) {
        try {
            activeMessages = await window.api.getMessages(convId, 50);
            renderMessages(activeMessages);
            scrollToBottom();
        } catch (err) {
            console.error('[Chat] Error loading messages:', err);
        }
    }

    // --- RENDER MESSAGES WITH STRICT SENDER ALIGNMENT (CRITICAL REQUIREMENT #2) ---

    function renderMessages(messages) {
        const container = document.getElementById('chatMessagesContainer');
        if (!container) return;

        if (!messages || messages.length === 0) {
            container.innerHTML = `
                <div style="margin: auto; text-align: center; color: #94A3B8;">
                    <i class="fa-regular fa-comments" style="font-size: 2.75rem; margin-bottom: 0.75rem; color: #C7D2FE;"></i>
                    <h4 style="color: #334155; font-weight: 700; margin-bottom: 0.25rem;">Start the conversation</h4>
                    <p style="font-size: 0.85rem;">Send a message below to start chatting!</p>
                </div>
            `;
            return;
        }

        let html = '';
        let lastDateStr = '';
        let lastSenderId = null;

        const currentConv = conversations.find(c => c.id === activeConvId);
        const isGroup = currentConv ? (currentConv.type === 'COURSE_GROUP' || currentConv.type === 'CUSTOM_GROUP') : false;

        messages.forEach((msg, idx) => {
            const msgDateStr = formatDateSeparator(msg.created_at);

            if (msgDateStr !== lastDateStr) {
                html += `<div class="chat-date-separator"><span>${msgDateStr}</span></div>`;
                lastDateStr = msgDateStr;
                lastSenderId = null;
            }

            // CRITICAL ALIGNMENT REQUIREMENT: STRICT CHECK ON AUTHENTICATED USER ID
            const isOwnMessage = String(msg.sender_id) === String(currentUser.id);
            const msgClass = isOwnMessage ? 'outgoing' : 'incoming';

            const showSenderHeader = isGroup && !isOwnMessage && (lastSenderId !== msg.sender_id);
            lastSenderId = msg.sender_id;

            const isNearTopEdge = (idx === 0);
            const toolbarPlacementClass = isNearTopEdge ? 'position-below' : 'position-above';

            // DELETED MESSAGE HANDLING (MUST NOT RENDER ATTACHMENTS, PREVIEWS, OR REPLIES)
            if (msg.is_deleted || msg.deleted_for_everyone) {
                const deletedHoverToolbar = `
                    <div class="msg-hover-toolbar ${toolbarPlacementClass}">
                        <button type="button" class="hover-action-btn" onclick="window.showMsgOptionsMenu(${msg.id}, event)" title="More Actions"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                    </div>
                `;

                html += `
                    <div class="chat-msg-row ${msgClass} is-deleted-row" id="msg-row-${msg.id}" data-msg-id="${msg.id}">
                        ${!isOwnMessage ? `
                            <div class="chat-msg-avatar">
                                ${msg.sender_avatar ? `<img src="${window.api.getImageUrl(msg.sender_avatar)}" alt="${escapeHTML(msg.sender_name)}">` : getInitials(msg.sender_name)}
                            </div>
                        ` : ''}

                        <div class="chat-msg-bubble-box">
                            <div class="chat-msg-bubble deleted-msg-bubble">
                                ${deletedHoverToolbar}
                                ${showSenderHeader ? `<span class="msg-sender-name">${escapeHTML(msg.sender_name)}</span>` : ''}
                                <div class="msg-deleted-content">
                                    <i class="fa-solid fa-ban" style="font-size: 0.85rem; color: #94A3B8;"></i>
                                    <span>This message was deleted</span>
                                </div>
                                <div class="msg-meta-row">
                                    <span>${formatTime(msg.created_at)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            // ATTACHMENTS HTML
            let attachmentsHtml = '';
            if (msg.attachments && msg.attachments.length > 0) {
                msg.attachments.forEach(att => {
                    if (att.file_type && att.file_type.startsWith('image/')) {
                        attachmentsHtml += `
                            <div class="msg-attachment-item msg-image-attachment">
                                <img src="${window.api.getImageUrl(att.file_path)}" alt="Uploaded image" onclick="window.open('${window.api.getImageUrl(att.file_path)}', '_blank')">
                            </div>
                        `;
                    } else {
                        attachmentsHtml += `
                            <div class="msg-attachment-item msg-doc-attachment">
                                <i class="fa-solid fa-file-pdf doc-icon"></i>
                                <div class="doc-info">
                                    <span class="doc-name">${escapeHTML(att.file_name)}</span>
                                    <span class="doc-size">${formatFileSize(att.file_size)}</span>
                                </div>
                                <a href="${window.api.getImageUrl(att.file_path)}" download="${escapeHTML(att.file_name)}" target="_blank" class="doc-download-btn" title="Download"><i class="fa-solid fa-download"></i></a>
                            </div>
                        `;
                    }
                });
            }

            // QUOTED REPLY HTML
            let replyHtml = '';
            if (msg.reply_to_message) {
                replyHtml = `
                    <div class="msg-reply-quoted-card" onclick="window.scrollToOriginalMessage(${msg.reply_to_message.id})">
                        <span class="quoted-sender">${escapeHTML(msg.reply_to_message.sender_name)}</span>
                        <p class="quoted-text">${escapeHTML(msg.reply_to_message.content || 'Attachment')}</p>
                    </div>
                `;
            }

            // FORWARDED TAG HTML
            let forwardedHtml = '';
            if (msg.is_forwarded) {
                forwardedHtml = `
                    <div class="msg-forwarded-tag">
                        <i class="fa-solid fa-share"></i> Forwarded
                    </div>
                `;
            }

            // REACTION BADGES HTML
            let reactionsHtml = '';
            if (msg.reactions && msg.reactions.length > 0) {
                const reactionCounts = {};
                const userReactedMap = {};
                msg.reactions.forEach(r => {
                    reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
                    if (String(r.user_id) === String(currentUser.id)) userReactedMap[r.emoji] = true;
                });
                reactionsHtml += `<div class="msg-reactions-bar">`;
                Object.keys(reactionCounts).forEach(emoji => {
                    const isMyReaction = userReactedMap[emoji];
                    reactionsHtml += `
                        <span class="reaction-pill ${isMyReaction ? 'user-reacted' : ''}" onclick="window.toggleReactionAction(${msg.id}, '${emoji}')">
                            ${emoji} <span>${reactionCounts[emoji]}</span>
                        </span>
                    `;
                });
                reactionsHtml += `</div>`;
            }

            // STATUS CHECKMARK LOGIC (Sent ✓, Read ✓✓)
            let statusIconHtml = '';
            if (isOwnMessage) {
                statusIconHtml = `<i class="fa-solid fa-check-double read-status-icon read" title="Read"></i>`;
            }

            const hoverToolbarHtml = `
                <div class="msg-hover-toolbar ${toolbarPlacementClass}">
                    <span class="hover-quick-emoji" onclick="window.toggleReactionAction(${msg.id}, '👍')">👍</span>
                    <span class="hover-quick-emoji" onclick="window.toggleReactionAction(${msg.id}, '❤️')">❤️</span>
                    <span class="hover-quick-emoji" onclick="window.toggleReactionAction(${msg.id}, '😂')">😂</span>
                    <span class="hover-quick-emoji" onclick="window.toggleReactionAction(${msg.id}, '😮')">😮</span>
                    <button type="button" class="hover-action-btn" onclick="window.replyMsgAction(${msg.id})" title="Reply"><i class="fa-solid fa-reply"></i></button>
                    <button type="button" class="hover-action-btn" onclick="window.showMsgOptionsMenu(${msg.id}, event)" title="More Actions"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                </div>
            `;

            // RENDER ROW
            html += `
                <div class="chat-msg-row ${msgClass}" id="msg-row-${msg.id}" data-msg-id="${msg.id}">
                    ${!isOwnMessage ? `
                        <div class="chat-msg-avatar">
                            ${msg.sender_avatar ? `<img src="${window.api.getImageUrl(msg.sender_avatar)}" alt="${escapeHTML(msg.sender_name)}">` : getInitials(msg.sender_name)}
                        </div>
                    ` : ''}

                    <div class="chat-msg-bubble-box">
                        <div class="chat-msg-bubble">
                            ${hoverToolbarHtml}
                            ${showSenderHeader ? `<span class="msg-sender-name">${escapeHTML(msg.sender_name)}</span>` : ''}
                            ${forwardedHtml}
                            ${replyHtml}
                            ${attachmentsHtml}
                            <div class="msg-text-content">${escapeHTML(msg.content)}</div>
                            <div class="msg-meta-row">
                                ${msg.is_edited ? `<span class="msg-edited-tag">Edited</span> • ` : ''}
                                <span>${formatTime(msg.created_at)}</span>
                                ${statusIconHtml}
                            </div>
                        </div>
                        ${reactionsHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Attach Selection & Interactive Listeners to Message Rows
        container.querySelectorAll('.chat-msg-row').forEach(row => {
            const msgId = parseInt(row.dataset.msgId, 10);
            if (!msgId) return;

            if (selectedMsgIds.has(msgId)) {
                row.classList.add('is-selected');
            }

            // Row click in selection mode
            row.addEventListener('click', (e) => {
                if (selectedMsgIds.size > 0) {
                    if (!e.target.closest('.hover-action-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        window.toggleSelectMessage(msgId);
                    }
                }
            });

            // Long press handler (400ms hold)
            let pressTimer = null;
            const startPress = (e) => {
                if (e.target.closest('button, a, .hover-quick-emoji, .msg-reply-quoted-card')) return;
                pressTimer = setTimeout(() => {
                    if (window.navigator && window.navigator.vibrate) {
                        try { window.navigator.vibrate(40); } catch (_) {}
                    }
                    window.toggleSelectMessage(msgId);
                }, 400);
            };
            const cancelPress = () => {
                if (pressTimer) clearTimeout(pressTimer);
            };

            row.addEventListener('touchstart', startPress, { passive: true });
            row.addEventListener('touchend', cancelPress);
            row.addEventListener('touchmove', cancelPress);
            row.addEventListener('mousedown', (e) => {
                if (e.button === 0 && selectedMsgIds.size === 0) startPress(e);
            });
            row.addEventListener('mouseup', cancelPress);
            row.addEventListener('mouseleave', cancelPress);
        });

        if (window.updateSelectionUI) {
            window.updateSelectionUI();
        }
    }

    // --- DOM EVENT LISTENERS ---

    function setupDOMEvents() {
        const catTabs = document.querySelectorAll('#chatCategoryTabs .chat-cat-tab, .chat-cat-tab');
        catTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                catTabs.forEach(t => t.classList.remove('active'));
                const target = e.currentTarget;
                target.classList.add('active');
                activeCategory = target.dataset.cat || 'chats';

                const searchInput = document.getElementById('chatSearchInput');
                if (searchInput) {
                    if (activeCategory === 'chats') searchInput.placeholder = 'Search conversations...';
                    else if (activeCategory === 'unread') searchInput.placeholder = 'Search unread conversations...';
                    else if (activeCategory === 'groups') searchInput.placeholder = 'Search course groups...';
                    else if (activeCategory === 'personal') searchInput.placeholder = 'Search contacts...';
                }

                renderConversationsList(conversations);
            });
        });

        const searchInput = document.getElementById('chatSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = (e.target.value || '').trim().toLowerCase();
                renderConversationsList(conversations);
            });
        }

        const mobileBackBtn = document.getElementById('chatMobileBackBtn');
        if (mobileBackBtn) {
            mobileBackBtn.addEventListener('click', () => {
                const appContainer = document.getElementById('chatAppContainer');
                if (appContainer) appContainer.classList.remove('mobile-open');
            });
        }

        const textarea = document.getElementById('chatComposerTextarea');
        const sendBtn = document.getElementById('chatSendBtn');

        if (textarea) {
            textarea.addEventListener('input', () => {
                autoResizeTextarea(textarea);
                toggleSendButtonState();
            });

            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                } else {
                    dispatchTyping();
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                handleSendMessage();
            });
        }

        const emojiBtn = document.getElementById('chatEmojiBtn');
        const emojiPopup = document.getElementById('chatEmojiPopup');
        if (emojiBtn && emojiPopup) {
            emojiBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                emojiPopup.style.display = emojiPopup.style.display === 'grid' ? 'none' : 'grid';
            });

            emojiPopup.querySelectorAll('.emoji-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    if (textarea) {
                        textarea.value += opt.textContent;
                        textarea.focus();
                        toggleSendButtonState();
                    }
                });
            });

            document.addEventListener('click', () => {
                emojiPopup.style.display = 'none';
            });
        }

        const attachBtn = document.getElementById('chatAttachBtn');
        const fileInput = document.getElementById('chatFileInput');
        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', async (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    const file = files[0];
                    try {
                        const uploaded = await window.api.uploadChatFile(file);
                        pendingAttachments.push(uploaded);
                        renderAttachmentPreview();
                        toggleSendButtonState();
                    } catch (err) {
                        alert(err.message || 'File upload failed');
                    } finally {
                        fileInput.value = '';
                    }
                }
            });
        }

        const newChatBtn = document.getElementById('chatNewBtn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
                showNewChatModal();
            });
        }
    }

    function autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    function toggleSendButtonState() {
        const textarea = document.getElementById('chatComposerTextarea');
        const sendBtn = document.getElementById('chatSendBtn');
        if (!sendBtn) return;

        const content = textarea ? textarea.value.trim() : '';
        const hasAttachment = pendingAttachments.length > 0;

        if (content.length > 0 || hasAttachment) {
            sendBtn.removeAttribute('disabled');
        } else {
            sendBtn.setAttribute('disabled', 'true');
        }
    }

    function renderAttachmentPreview() {
        const composer = document.querySelector('.chat-composer');
        let container = document.getElementById('composerAttachmentPreview');

        if (pendingAttachments.length === 0) {
            if (container) container.remove();
            return;
        }

        if (!container) {
            container = document.createElement('div');
            container.id = 'composerAttachmentPreview';
            container.className = 'composer-attachment-preview';
            const inputRow = composer.querySelector('.composer-input-row');
            composer.insertBefore(container, inputRow);
        }

        const att = pendingAttachments[0];
        const isImg = att.file_type && att.file_type.startsWith('image/');

        container.innerHTML = `
            <i class="fa-solid ${isImg ? 'fa-image' : 'fa-file-pdf'}"></i>
            <div class="composer-attachment-info">
                <span class="composer-attachment-name">${escapeHTML(att.file_name)}</span>
                <span style="font-size: 0.725rem; color: #64748B;">${formatFileSize(att.file_size)}</span>
            </div>
            <button type="button" class="banner-close-btn" onclick="window.clearPendingAttachment()">&times;</button>
        `;
    }

    window.clearPendingAttachment = () => {
        pendingAttachments = [];
        renderAttachmentPreview();
        toggleSendButtonState();
    };

    function dispatchTyping() {
        if (!activeConvId || !ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
            type: 'TYPING',
            data: { conversation_id: activeConvId, is_typing: true }
        }));
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            ws.send(JSON.stringify({
                type: 'TYPING',
                data: { conversation_id: activeConvId, is_typing: false }
            }));
        }, 3000);
    }

    async function handleSendMessage() {
        const textarea = document.getElementById('chatComposerTextarea');
        const sendBtn = document.getElementById('chatSendBtn');
        const content = textarea ? textarea.value.trim() : '';

        if (!activeConvId) {
            alert('Please select a conversation first.');
            return;
        }

        if (!content && pendingAttachments.length === 0) return;

        if (sendBtn) sendBtn.setAttribute('disabled', 'true');

        try {
            if (editingMsgState) {
                await window.api.editMessage(editingMsgState.id, content);
                clearEditBanner();
            } else {
                const attIds = pendingAttachments.map(a => a.id);
                await window.api.sendMessage({
                    conversation_id: activeConvId,
                    content: content,
                    reply_to_message_id: replyState ? replyState.id : null,
                    attachment_ids: attIds
                });
                clearReplyBanner();
                pendingAttachments = [];
                renderAttachmentPreview();
            }

            if (textarea) {
                textarea.value = '';
                textarea.style.height = 'auto';
            }
            toggleSendButtonState();

            await loadActiveMessages(activeConvId);
            await loadConversations();
        } catch (err) {
            alert(err.message || 'Failed to send message.');
            toggleSendButtonState();
        }
    }

    // --- REPLIES & EDITING BANNERS ---

    window.replyMsgAction = (msgId) => {
        const msg = activeMessages.find(m => m.id === msgId);
        if (!msg) return;
        replyState = msg;
        clearEditBanner();

        const composer = document.querySelector('.chat-composer');
        let banner = document.getElementById('chatReplyBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'chatReplyBanner';
            banner.className = 'composer-preview-banner';
            const inputRow = composer.querySelector('.composer-input-row');
            composer.insertBefore(banner, inputRow);
        }

        banner.innerHTML = `
            <div class="banner-left">
                <i class="fa-solid fa-reply"></i>
                <div class="banner-text">
                    <strong>Replying to ${escapeHTML(msg.sender_name)}</strong>: "${escapeHTML((msg.content || 'Attachment').substring(0, 45))}"
                </div>
            </div>
            <button type="button" class="banner-close-btn" onclick="window.clearReplyBanner()">&times;</button>
        `;

        const textarea = document.getElementById('chatComposerTextarea');
        if (textarea) textarea.focus();
    };

    window.clearReplyBanner = () => {
        replyState = null;
        const banner = document.getElementById('chatReplyBanner');
        if (banner) banner.remove();
    };

    window.editMsgAction = (msgId) => {
        const msg = activeMessages.find(m => m.id === msgId);
        if (!msg) return;
        editingMsgState = msg;
        clearReplyBanner();

        const composer = document.querySelector('.chat-composer');
        let banner = document.getElementById('chatEditBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'chatEditBanner';
            banner.className = 'composer-preview-banner';
            banner.style.borderLeftColor = '#3B82F6';
            const inputRow = composer.querySelector('.composer-input-row');
            composer.insertBefore(banner, inputRow);
        }

        banner.innerHTML = `
            <div class="banner-left">
                <i class="fa-solid fa-pen" style="color: #3B82F6;"></i>
                <div class="banner-text">
                    <strong>Editing message</strong>
                </div>
            </div>
            <button type="button" class="banner-close-btn" onclick="window.clearEditBanner()">&times;</button>
        `;

        const textarea = document.getElementById('chatComposerTextarea');
        if (textarea) {
            textarea.value = msg.content || '';
            textarea.focus();
            autoResizeTextarea(textarea);
            toggleSendButtonState();
        }
    };

    window.clearEditBanner = () => {
        editingMsgState = null;
        const banner = document.getElementById('chatEditBanner');
        if (banner) banner.remove();
        const textarea = document.getElementById('chatComposerTextarea');
        if (textarea) textarea.value = '';
        toggleSendButtonState();
    };

    window.scrollToOriginalMessage = (msgId) => {
        const row = document.getElementById(`msg-row-${msgId}`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('highlight-pulse');
            setTimeout(() => row.classList.remove('highlight-pulse'), 2000);
        } else {
            alert('Original message is not in current view limit.');
        }
    };

    // --- ACTIONS & CONTEXT MENUS ---

    // --- REPLIES, EDITING & ACTIONS ---

    window.toggleReactionAction = async (msgId, emoji) => {
        try {
            await window.api.toggleReaction(msgId, emoji);
            await loadActiveMessages(activeConvId);
        } catch (err) {
            alert(err.message || 'Reaction failed');
        }
    };

    // --- SELECTION TOOLBAR & STATE (REFERENCE 1 & REFERENCE 2) ---

    window.toggleSelectMessage = (msgId) => {
        if (!msgId) return;
        if (selectedMsgIds.has(msgId)) {
            selectedMsgIds.delete(msgId);
        } else {
            selectedMsgIds.add(msgId);
        }
        window.updateSelectionUI();
    };

    window.clearMessageSelection = () => {
        selectedMsgIds.clear();
        window.updateSelectionUI();
    };

    window.updateSelectionUI = () => {
        const header = document.querySelector('.chat-header');
        let toolbar = document.getElementById('chatSelectionToolbar');

        if (selectedMsgIds.size === 0) {
            if (toolbar) toolbar.remove();
            document.querySelectorAll('.chat-msg-row').forEach(row => row.classList.remove('is-selected'));
            return;
        }

        if (!toolbar && header) {
            toolbar = document.createElement('div');
            toolbar.id = 'chatSelectionToolbar';
            toolbar.className = 'chat-selection-toolbar';
            header.appendChild(toolbar);
        }

        const count = selectedMsgIds.size;
        const singleSelected = count === 1;

        if (toolbar) {
            toolbar.innerHTML = `
                <div class="selection-left">
                    <button type="button" class="selection-btn" onclick="window.clearMessageSelection()" title="Cancel selection">
                        <i class="fa-solid fa-arrow-left"></i>
                    </button>
                    <span class="selection-count" id="selectionCount">${count}</span>
                </div>
                <div class="selection-actions">
                    <button type="button" class="selection-action-btn ${!singleSelected ? 'disabled' : ''}" onclick="window.handleSelectionReply()" title="Reply" ${!singleSelected ? 'disabled' : ''}>
                        <i class="fa-solid fa-reply"></i>
                    </button>
                    <button type="button" class="selection-action-btn" onclick="window.handleSelectionStar()" title="Star">
                        <i class="fa-regular fa-star"></i>
                    </button>
                    <button type="button" class="selection-action-btn ${!singleSelected ? 'disabled' : ''}" onclick="window.handleSelectionInfo()" title="Info" ${!singleSelected ? 'disabled' : ''}>
                        <i class="fa-solid fa-circle-info"></i>
                    </button>
                    <button type="button" class="selection-action-btn selection-delete-btn" onclick="window.showDeleteConfirmationModal()" title="Delete">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                    <button type="button" class="selection-action-btn" onclick="window.handleSelectionForward()" title="Forward">
                        <i class="fa-solid fa-share"></i>
                    </button>
                    <button type="button" class="selection-action-btn" onclick="window.handleSelectionMore(event)" title="More options">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                </div>
            `;
        }

        // Highlight selected message rows
        document.querySelectorAll('.chat-msg-row').forEach(row => {
            const mId = parseInt(row.dataset.msgId, 10);
            if (selectedMsgIds.has(mId)) {
                row.classList.add('is-selected');
            } else {
                row.classList.remove('is-selected');
            }
        });
    };

    window.handleSelectionReply = () => {
        if (selectedMsgIds.size !== 1) return;
        const msgId = Array.from(selectedMsgIds)[0];
        window.clearMessageSelection();
        window.replyMsgAction(msgId);
    };

    window.handleSelectionStar = () => {
        if (selectedMsgIds.size === 0) return;
        alert(`${selectedMsgIds.size} message(s) starred.`);
        window.clearMessageSelection();
    };

    window.handleSelectionInfo = () => {
        if (selectedMsgIds.size !== 1) return;
        const msgId = Array.from(selectedMsgIds)[0];
        const msg = activeMessages.find(m => m.id === msgId);
        if (!msg) return;
        alert(`Message Info:\nSender: ${msg.sender_name}\nSent: ${msg.created_at}\nStatus: Read`);
        window.clearMessageSelection();
    };

    window.handleSelectionForward = () => {
        if (selectedMsgIds.size === 0) return;
        const msgId = Array.from(selectedMsgIds)[0];
        window.forwardMsgAction(msgId);
    };

    window.handleSelectionMore = (event) => {
        event.stopPropagation();
        const existing = document.getElementById('selectionMoreMenu');
        if (existing) {
            existing.remove();
            return;
        }

        const menu = document.createElement('div');
        menu.id = 'selectionMoreMenu';
        menu.className = 'chat-context-menu';
        menu.style.right = '1.25rem';
        menu.style.top = '60px';
        menu.style.left = 'auto';

        let html = `
            <div class="context-item" onclick="window.selectAllMessages(); window.closeSelectionMoreMenu();">
                <i class="fa-solid fa-check-double"></i> Select All
            </div>
        `;
        if (selectedMsgIds.size === 1) {
            const msgId = Array.from(selectedMsgIds)[0];
            const msg = activeMessages.find(m => m.id === msgId);
            if (msg && msg.content) {
                html += `
                    <div class="context-item" onclick="window.copyMsgAction(${msgId}); window.closeSelectionMoreMenu();">
                        <i class="fa-solid fa-copy"></i> Copy Text
                    </div>
                `;
            }
        }
        html += `
            <div class="context-item" onclick="window.clearMessageSelection(); window.closeSelectionMoreMenu();">
                <i class="fa-solid fa-xmark"></i> Deselect All
            </div>
        `;
        menu.innerHTML = html;
        document.body.appendChild(menu);
        setTimeout(() => {
            document.addEventListener('click', window.closeSelectionMoreMenu, { once: true });
        }, 10);
    };

    window.closeSelectionMoreMenu = () => {
        const existing = document.getElementById('selectionMoreMenu');
        if (existing) existing.remove();
    };

    window.selectAllMessages = () => {
        activeMessages.forEach(m => selectedMsgIds.add(m.id));
        window.updateSelectionUI();
    };

    // --- REFERENCE 2 DELETE CONFIRMATION MODAL ---

    window.showDeleteConfirmationModal = (targetMsgId = null) => {
        if (targetMsgId) {
            selectedMsgIds.clear();
            selectedMsgIds.add(targetMsgId);
            window.updateSelectionUI();
        }

        if (selectedMsgIds.size === 0) return;

        window.closeDeleteModal();

        const selectedList = Array.from(selectedMsgIds);
        let canDeleteForEveryone = true;

        selectedList.forEach(id => {
            const msg = activeMessages.find(m => m.id === id);
            const isOwn = currentUser && String(msg?.sender_id) === String(currentUser.id);
            const isAdmin = currentUser && (currentUser.role || '').toUpperCase() === 'ADMIN';
            if (!msg || (!isOwn && !isAdmin) || msg.is_deleted || msg.deleted_for_everyone) {
                canDeleteForEveryone = false;
            }
        });

        const titleText = selectedList.length === 1 ? 'Delete message?' : `Delete ${selectedList.length} messages?`;

        const modal = document.createElement('div');
        modal.id = 'deleteConfirmModal';
        modal.className = 'smartlearn-delete-dialog-overlay';

        modal.innerHTML = `
            <div class="smartlearn-delete-dialog-card">
                <h3>${titleText}</h3>
                <div class="delete-dialog-options">
                    ${canDeleteForEveryone ? `
                        <button type="button" class="delete-dialog-opt-btn" onclick="window.executeSelectedDelete(true)">
                            Delete for everyone
                        </button>
                    ` : ''}
                    <button type="button" class="delete-dialog-opt-btn" onclick="window.executeSelectedDelete(false)">
                        Delete for me
                    </button>
                    <button type="button" class="delete-dialog-opt-btn" onclick="window.closeDeleteModal()">
                        Cancel
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    };

    window.closeDeleteModal = () => {
        const existing = document.getElementById('deleteConfirmModal');
        if (existing) existing.remove();
    };

    window.confirmDeleteMsgModal = (msgId, forEveryone) => {
        window.showDeleteConfirmationModal(msgId);
    };

    window.executeSelectedDelete = async (forEveryone) => {
        window.closeDeleteModal();
        const ids = Array.from(selectedMsgIds);
        if (ids.length === 0) return;

        try {
            for (const msgId of ids) {
                await window.api.deleteMessage(msgId, forEveryone);
            }
            window.clearMessageSelection();
            await loadActiveMessages(activeConvId);
            await loadConversations();
            if (document.getElementById('chatSharedPanel')) {
                window.openSharedContentPanel(activeConvId, activeSharedTab);
            }
        } catch (err) {
            alert(err.message || 'Delete failed.');
        }
    };

    window.showMsgOptionsMenu = (msgId, event) => {
        event.stopPropagation();
        const msg = activeMessages.find(m => m.id === msgId);
        if (!msg) return;

        const existing = document.getElementById('chatMsgContextMenu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'chatMsgContextMenu';
        menu.className = 'chat-context-menu';

        // Viewport boundary positioning
        let x = event.clientX;
        let y = event.clientY;
        const menuWidth = 200;
        const menuHeight = 260;

        if (x + menuWidth > window.innerWidth - 15) {
            x = window.innerWidth - menuWidth - 15;
        }
        if (y + menuHeight > window.innerHeight - 15) {
            y = window.innerHeight - menuHeight - 15;
        }

        menu.style.left = `${Math.max(10, x)}px`;
        menu.style.top = `${Math.max(10, y)}px`;

        const isOwnMessage = currentUser && String(msg.sender_id) === String(currentUser.id);
        const isAdmin = currentUser && (currentUser.role || '').toUpperCase() === 'ADMIN';
        const canDeleteForEveryone = (isOwnMessage || isAdmin) && !msg.is_deleted;

        let menuHtml = '';

        if (msg.is_deleted || msg.deleted_for_everyone) {
            menuHtml = `
                <div class="context-item text-danger" onclick="window.showDeleteConfirmationModal(${msgId}); window.closeMsgContextMenu();">
                    <i class="fa-solid fa-trash-can"></i> Delete for Me
                </div>
            `;
        } else {
            menuHtml = `
                <div class="context-item" onclick="window.toggleSelectMessage(${msgId}); window.closeMsgContextMenu();"><i class="fa-solid fa-check-square"></i> Select</div>
                <div class="context-item" onclick="window.replyMsgAction(${msgId}); window.closeMsgContextMenu();"><i class="fa-solid fa-reply"></i> Reply</div>
                <div class="context-item" onclick="window.toggleReactionMenu(${msgId}); window.closeMsgContextMenu();"><i class="fa-regular fa-face-smile"></i> React</div>
            `;

            if (msg.content && msg.content.trim() !== '') {
                menuHtml += `<div class="context-item" onclick="window.copyMsgAction(${msgId}); window.closeMsgContextMenu();"><i class="fa-solid fa-copy"></i> Copy Text</div>`;
            }

            menuHtml += `<div class="context-item" onclick="window.forwardMsgAction(${msgId}); window.closeMsgContextMenu();"><i class="fa-solid fa-share"></i> Forward</div>`;

            if (isOwnMessage) {
                menuHtml += `<div class="context-item" onclick="window.editMsgAction(${msgId}); window.closeMsgContextMenu();"><i class="fa-solid fa-pen"></i> Edit</div>`;
            }

            menuHtml += `<div class="context-divider"></div>`;

            menuHtml += `
                <div class="context-item text-danger" onclick="window.showDeleteConfirmationModal(${msgId}); window.closeMsgContextMenu();">
                    <i class="fa-solid fa-trash-can"></i> Delete Message
                </div>
            `;

            menuHtml += `<div class="context-divider"></div>`;
            menuHtml += `<div class="context-item" onclick="window.pinMsgAction(${msgId}); window.closeMsgContextMenu();"><i class="fa-solid fa-thumbtack"></i> Pin</div>`;
        }

        menu.innerHTML = menuHtml;
        document.body.appendChild(menu);

        setTimeout(() => {
            document.addEventListener('click', window.closeMsgContextMenu, { once: true });
        }, 10);
    };

    window.closeMsgContextMenu = () => {
        const existing = document.getElementById('chatMsgContextMenu');
        if (existing) existing.remove();
    };

    window.toggleReactionMenu = (msgId) => {
        const emojis = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🎉'];
        const selectedEmoji = prompt(`Reaction emoji (${emojis.join(' ')}):`, '👍');
        if (selectedEmoji && emojis.includes(selectedEmoji.trim())) {
            window.toggleReactionAction(msgId, selectedEmoji.trim());
        }
    };

    window.pinMsgAction = (msgId) => {
        alert('Message pinned.');
    };

    window.markUnreadAction = (msgId) => {
        if (activeConvId) {
            const conv = conversations.find(c => c.id === activeConvId);
            if (conv) {
                conv.unread_count = (conv.unread_count || 0) + 1;
                renderConversationsList(conversations);
                updateGlobalUnreadBadge();
                alert('Marked conversation as unread.');
            }
        }
    };

    window.copyMsgAction = (msgId) => {
        const msg = activeMessages.find(m => m.id === msgId);
        if (msg && msg.content) {
            navigator.clipboard.writeText(msg.content);
            alert('Message copied to clipboard!');
        }
    };

    window.deleteMsgAction = (msgId) => {
        const msg = activeMessages.find(m => m.id === msgId);
        const isOwn = currentUser && String(msg?.sender_id) === String(currentUser.id);
        const isAdmin = currentUser && (currentUser.role || '').toUpperCase() === 'ADMIN';
        window.confirmDeleteMsgModal(msgId, isOwn || isAdmin);
    };

    window.forwardMsgAction = async (msgId) => {
        const msg = activeMessages.find(m => m.id === msgId);
        if (!msg) return;

        const otherConvs = conversations.filter(c => c.id !== activeConvId);
        if (otherConvs.length === 0) {
            alert('No other conversations available to forward to.');
            return;
        }

        showForwardModal(msgId, otherConvs);
    };

    function showForwardModal(msgId, targetConvs) {
        const existing = document.getElementById('forwardModal');
        if (existing) existing.remove();

        let html = `
            <div class="modal-overlay" id="forwardModal" style="position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 1000;">
                <div style="background: #FFFFFF; border-radius: 16px; width: 90%; max-width: 440px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15); border: 1px solid #E2E8F0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; border-bottom: 1px solid #E2E8F0; padding-bottom: 0.75rem;">
                        <h3 style="font-size: 1.15rem; font-weight: 800; color: #0F172A; margin: 0;">Forward Message</h3>
                        <button onclick="document.getElementById('forwardModal').remove()" style="background: #F1F5F9; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: 1.1rem; cursor: pointer; color: #64748B;">&times;</button>
                    </div>

                    <div style="max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem;">
        `;

        targetConvs.forEach(c => {
            html += `
                <div class="forward-target-item" onclick="window.confirmForward(${msgId}, ${c.id}, '${escapeHTML(c.title)}')" style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.85rem; border-radius: 10px; background: #F8FAFC; border: 1px solid #F1F5F9; cursor: pointer; transition: background 0.15s ease;" onmouseover="this.style.background='#EEF2FF'" onmouseout="this.style.background='#F8FAFC'">
                    <strong style="font-size: 0.875rem; color: #0F172A;">${escapeHTML(c.title)}</strong>
                    <span style="font-size: 0.75rem; color: #4F46E5; font-weight: 700;">Forward →</span>
                </div>
            `;
        });

        html += `
                    </div>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    }

    window.confirmForward = async (msgId, targetConvId, targetTitle) => {
        const modal = document.getElementById('forwardModal');
        if (modal) modal.remove();

        try {
            await window.api.forwardMessage(msgId, [targetConvId]);
            alert(`Message forwarded to ${targetTitle}!`);
        } catch (err) {
            alert(err.message || 'Forward failed.');
        }
    };

    // --- NEW CHAT MODAL ---

    function showNewChatModal() {
        const existing = document.getElementById('newChatModal');
        if (existing) existing.remove();

        const instructors = allowedContacts.filter(c => c.role.toLowerCase() === 'instructor');
        const students = allowedContacts.filter(c => c.role.toLowerCase() === 'student');
        const admins = allowedContacts.filter(c => c.role.toLowerCase() === 'admin');

        let html = `
            <div class="modal-overlay" id="newChatModal" style="position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 1000;">
                <div style="background: #FFFFFF; border-radius: 16px; width: 90%; max-width: 480px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15); border: 1px solid #E2E8F0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; border-bottom: 1px solid #E2E8F0; padding-bottom: 0.75rem;">
                        <h3 style="font-size: 1.15rem; font-weight: 800; color: #0F172A; margin: 0;">Start New Conversation</h3>
                        <button onclick="document.getElementById('newChatModal').remove()" style="background: #F1F5F9; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: 1.1rem; cursor: pointer; color: #64748B;">&times;</button>
                    </div>

                    <div style="max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.85rem;">
        `;

        if (allowedContacts.length === 0) {
            html += `<p style="color: #64748B; font-size: 0.875rem; text-align: center; padding: 1.5rem;">No contacts available.</p>`;
        } else {
            if (instructors.length > 0) {
                html += `<div><div class="chat-section-label" style="padding-left:0; color:#4F46E5;"><i class="fa-solid fa-chalkboard-user"></i> Instructors</div>`;
                instructors.forEach(c => html += buildContactPickItemHTML(c));
                html += `</div>`;
            }

            if (students.length > 0) {
                html += `<div><div class="chat-section-label" style="padding-left:0; color:#10B981;"><i class="fa-solid fa-user-graduate"></i> Students</div>`;
                students.forEach(c => html += buildContactPickItemHTML(c));
                html += `</div>`;
            }

            if (admins.length > 0) {
                html += `<div><div class="chat-section-label" style="padding-left:0; color:#EF4444;"><i class="fa-solid fa-user-shield"></i> Administration</div>`;
                admins.forEach(c => html += buildContactPickItemHTML(c));
                html += `</div>`;
            }
        }

        html += `
                    </div>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    }

    function buildContactPickItemHTML(c) {
        return `
            <div class="contact-pick-item" onclick="window.startChatWithUser(${c.id})" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem; border-radius: 10px; cursor: pointer; transition: background 0.15s ease;" onmouseover="this.style.background='#F1F5F9'" onmouseout="this.style.background='transparent'">
                <div class="chat-avatar" style="width: 36px; height: 36px; font-size: 0.85rem; background: linear-gradient(135deg, #8B5CF6, #6366F1);">
                    ${c.profile_image ? `<img src="${window.api.getImageUrl(c.profile_image)}" alt="${escapeHTML(c.full_name)}">` : getInitials(c.full_name)}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <strong style="font-size: 0.875rem; color: #0F172A; display: block;">${escapeHTML(c.full_name)}</strong>
                    <span style="font-size: 0.75rem; color: #64748B;">${c.role} • ${escapeHTML(c.course_title || '')}</span>
                </div>
            </div>
        `;
    }

    window.startChatWithUser = async (targetUserId) => {
        const modal = document.getElementById('newChatModal');
        if (modal) modal.remove();

        try {
            const conv = await window.api.createConversation({
                type: 'PERSONAL',
                target_user_id: targetUserId
            });
            await loadConversations();
            openConversation(conv.id);
        } catch (err) {
            alert(err.message || 'Could not start chat.');
        }
    };

    // --- BROWSER DESKTOP NOTIFICATIONS & SETTINGS MODAL ---

    function getNotifSettings() {
        const defaults = {
            desktopNotifs: true,
            messageNotifs: true,
            groupNotifs: true,
            soundNotifs: true,
            mentionNotifs: true
        };
        try {
            const stored = localStorage.getItem('smartlearn_notif_settings');
            return stored ? Object.assign(defaults, JSON.parse(stored)) : defaults;
        } catch (_) {
            return defaults;
        }
    }

    function saveNotifSettings(settings) {
        localStorage.setItem('smartlearn_notif_settings', JSON.stringify(settings));
    }

    function setupDesktopNotifications() {
        console.log("Notification permission:", Notification.permission);
        console.log("Current user:", currentUser?.id);
    }

    window.openNotificationSettingsModal = () => {
        const existing = document.getElementById('notifSettingsModal');
        if (existing) existing.remove();

        const settings = getNotifSettings();

        const html = `
            <div class="modal-overlay" id="notifSettingsModal" style="position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 100000;">
                <div style="background: #FFFFFF; border-radius: 16px; width: 90%; max-width: 440px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15); border: 1px solid #E2E8F0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; border-bottom: 1px solid #E2E8F0; padding-bottom: 0.75rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fa-solid fa-bell" style="color: #6366F1; font-size: 1.2rem;"></i>
                            <h3 style="font-size: 1.1rem; font-weight: 800; color: #0F172A; margin: 0;">Notification Settings</h3>
                        </div>
                        <button onclick="document.getElementById('notifSettingsModal').remove()" style="background: #F1F5F9; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: 1.1rem; cursor: pointer; color: #64748B;">&times;</button>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.25rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <strong style="font-size: 0.885rem; color: #0F172A; display: block;">Desktop Notifications</strong>
                                <span style="font-size: 0.75rem; color: #64748B;">Browser push alerts for new messages</span>
                            </div>
                            <input type="checkbox" id="notifToggleDesktop" ${settings.desktopNotifs ? 'checked' : ''} onchange="window.handleDesktopNotifToggle(this.checked)" style="width: 18px; height: 18px; cursor: pointer; accent-color: #6366F1;">
                        </div>

                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <strong style="font-size: 0.885rem; color: #0F172A; display: block;">Message Notifications</strong>
                                <span style="font-size: 0.75rem; color: #64748B;">Alerts for 1-on-1 personal messages</span>
                            </div>
                            <input type="checkbox" id="notifToggleMessage" ${settings.messageNotifs ? 'checked' : ''} onchange="window.updateNotifSetting('messageNotifs', this.checked)" style="width: 18px; height: 18px; cursor: pointer; accent-color: #6366F1;">
                        </div>

                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <strong style="font-size: 0.885rem; color: #0F172A; display: block;">Group Notifications</strong>
                                <span style="font-size: 0.75rem; color: #64748B;">Alerts for course and custom groups</span>
                            </div>
                            <input type="checkbox" id="notifToggleGroup" ${settings.groupNotifs ? 'checked' : ''} onchange="window.updateNotifSetting('groupNotifs', this.checked)" style="width: 18px; height: 18px; cursor: pointer; accent-color: #6366F1;">
                        </div>

                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <strong style="font-size: 0.885rem; color: #0F172A; display: block;">Message Sound</strong>
                                <span style="font-size: 0.75rem; color: #64748B;">Play short chime on incoming message</span>
                            </div>
                            <input type="checkbox" id="notifToggleSound" ${settings.soundNotifs ? 'checked' : ''} onchange="window.updateNotifSetting('soundNotifs', this.checked)" style="width: 18px; height: 18px; cursor: pointer; accent-color: #6366F1;">
                        </div>

                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <strong style="font-size: 0.885rem; color: #0F172A; display: block;">Mention Notifications</strong>
                                <span style="font-size: 0.75rem; color: #64748B;">Alerts when mentioned in chats</span>
                            </div>
                            <input type="checkbox" id="notifToggleMention" ${settings.mentionNotifs ? 'checked' : ''} onchange="window.updateNotifSetting('mentionNotifs', this.checked)" style="width: 18px; height: 18px; cursor: pointer; accent-color: #6366F1;">
                        </div>
                    </div>

                    <div style="text-align: right;">
                        <button onclick="document.getElementById('notifSettingsModal').remove()" style="background: #6366F1; color: #FFFFFF; border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.85rem;">Save & Close</button>
                    </div>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    };

    window.handleDesktopNotifToggle = (isChecked) => {
        if (isChecked) {
            if (!('Notification' in window)) {
                alert('Desktop notifications are not supported in your browser.');
                const toggle = document.getElementById('notifToggleDesktop');
                if (toggle) toggle.checked = false;
                window.updateNotifSetting('desktopNotifs', false);
                return;
            }

            if (Notification.permission === 'granted') {
                window.updateNotifSetting('desktopNotifs', true);
            } else if (Notification.permission === 'denied') {
                alert('Desktop notifications are blocked by your browser. Please enable them from your browser site settings.');
                const toggle = document.getElementById('notifToggleDesktop');
                if (toggle) toggle.checked = false;
                window.updateNotifSetting('desktopNotifs', false);
            } else {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        window.updateNotifSetting('desktopNotifs', true);
                    } else {
                        alert('Desktop notifications permission was not granted.');
                        const toggle = document.getElementById('notifToggleDesktop');
                        if (toggle) toggle.checked = false;
                        window.updateNotifSetting('desktopNotifs', false);
                    }
                });
            }
        } else {
            window.updateNotifSetting('desktopNotifs', false);
        }
    };

    window.updateNotifSetting = (key, val) => {
        const settings = getNotifSettings();
        settings[key] = val;
        saveNotifSettings(settings);
    };

    function showDesktopNotification(title, body, conversationId, messageId, avatar) {
        console.log("Notification permission:", Notification.permission);
        console.log("Current user:", currentUser?.id);
        console.log("Message sender:", messageId ? 'sender' : null);
        console.log("Message conversation:", conversationId);
        console.log("Active conversation:", activeConvId);
        console.log("Visibility:", document.visibilityState);

        const settings = getNotifSettings();

        if (!settings.desktopNotifs) {
            console.log('[DesktopNotif] Suppressed: Desktop notifications turned OFF in SmartLearn settings.');
            showInAppToast({
                id: messageId,
                conversation_id: conversationId,
                title: title,
                body: body,
                avatar: avatar
            });
            return false;
        }

        if (!('Notification' in window) || Notification.permission !== 'granted') {
            console.warn('[DesktopNotif] Permission not granted or unsupported:', Notification.permission);
            showInAppToast({
                id: messageId,
                conversation_id: conversationId,
                title: title,
                body: body,
                avatar: avatar
            });
            return false;
        }

        try {
            const options = {
                body: body || 'New message received',
                icon: avatar ? window.api.getImageUrl(avatar) : '../css/favicon.ico',
                tag: `chat-${messageId}`,
                renotify: true
            };

            const notif = new Notification(title, options);

            notif.onclick = (e) => {
                e.preventDefault();
                window.focus();

                if (window.location.pathname.toLowerCase().includes('chat.html')) {
                    if (conversationId) {
                        openConversation(conversationId);
                    }
                } else {
                    window.location.href = conversationId ? `chat.html?conv_id=${conversationId}` : 'chat.html';
                }
                notif.close();
            };
            return true;
        } catch (e) {
            console.error('[DesktopNotif] Error creating browser notification:', e);
            showInAppToast({
                id: messageId,
                conversation_id: conversationId,
                title: title,
                body: body,
                avatar: avatar
            });
            return false;
        }
    }

    function triggerNotificationAlert(notifData) {
        showDesktopNotification(
            notifData.title || 'SmartLearn Message',
            notifData.body || 'New message received',
            notifData.conversation_id,
            notifData.id,
            notifData.avatar
        );
    }

    function showInAppToast(notifData) {
        let toastContainer = document.getElementById('chatToastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'chatToastContainer';
            toastContainer.className = 'chat-toast-container';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = 'chat-toast-notification';
        toast.innerHTML = `
            <div class="chat-avatar" style="width: 34px; height: 34px; font-size: 0.8rem; flex-shrink: 0;">
                ${notifData.avatar ? `<img src="${window.api.getImageUrl(notifData.avatar)}">` : '💬'}
            </div>
            <div style="flex: 1; min-width: 0;">
                <strong style="font-size: 0.85rem; color: #0F172A; display: block;">${escapeHTML(notifData.title)}</strong>
                <span style="font-size: 0.775rem; color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${escapeHTML(notifData.body)}</span>
            </div>
        `;

        toast.addEventListener('click', () => {
            if (notifData.conversation_id) {
                openConversation(notifData.conversation_id);
            }
            toast.remove();
        });

        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4500);
    }

    // --- UTILITIES ---

    function getInitials(name) {
        if (!name) return 'U';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function formatShortTime(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatTime(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatDateSeparator(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (d.toDateString() === today.toDateString()) return 'Today';
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function scrollToBottom() {
        const container = document.getElementById('chatMessagesContainer');
        if (container) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 60);
        }
    }

})();
