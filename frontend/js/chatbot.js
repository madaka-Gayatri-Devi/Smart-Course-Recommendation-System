/**



 * SmartLearn AI Chatbot Assistant - Shared Component



 * ===================================================



 * Universal chatbot widget mounted across Student, Instructor, and Admin dashboards.



 * 



 * Features:



 * 1. 4-Screen Repositioning: Left, Right, Top, Bottom dynamically selectable and persisted in localStorage.



 * 2. Window Controls: Minimize to header bar, Maximize to wide view, and Close.



 * 3. Connection/Status Indicator: AI Ready (Online), Thinking..., Offline.



 * 4. Rich Chat Interface: Distinct message bubbles, formatted markdown, timestamps, typing indicator, auto-scroll.



 * 5. Keyboard Navigation: Enter to send, Shift+Enter for newline, duplicate submission prevention.



 * 6. Error & Retry States: Friendly error messages with 1-click retry.



 * 7. New Chat / Clear Conversation: Confirmation modal preserving history drawer persistence.



 * 8. Real AI Integration: Grounded in authenticated backend user context (enrolled courses, progress, skill gaps, assessments).



 * 9. Voice-Based Chatbot: Speech-to-Text with review before send, and Text-to-Speech (TTS) response playback.



 * 10. Multi-tenant isolation: Complete per-user history drawer separation.



 */







(function () {



  'use strict';







  // ==========================================



// 1. COMPONENT STATE & INITIALIZATION



// Internal state variables, window sizing, audio streams, and feature detection.



// ==========================================



  let currentConversationId = null;
  try {
    const _savedConv = sessionStorage.getItem('smartlearn_chatbot_active_conv');
    if (_savedConv && !isNaN(Number(_savedConv))) {
      currentConversationId = Number(_savedConv);
    }
  } catch (_) {}



  let isGenerating = false;



  let isListening = false;



  let isStarting = false;



  let userExplicitlyStopped = false;



  let recognition = null;



  let voiceStatusTimeout = null;



  let activeTtsBtn = null;



  let activeTranscript = '';



  let speechStarted = false;



  let baseInputText = '';



  let noSpeechRetryCount = 0;



  let lastFailedMessage = '';







  // Window State



  let isMinimized = false;



  let isMaximized = false;



  let currentPosition = localStorage.getItem('smartlearn_chatbot_position') || 'right';



  if (!['right', 'left', 'top', 'bottom'].includes(currentPosition)) {



    currentPosition = 'right';



  }







  // MediaStream and Audio Recording fallback state



  let activeMediaStream = null;



  let activeMediaRecorder = null;



  let recordedAudioChunks = [];



  let isTranscribingBackend = false;



  let browserSpeechSucceeded = false;







  // Browser Web Speech API Feature Detection



  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;



  const isSpeechRecognitionSupported = !!SpeechRecognitionClass;



  const isSpeechSynthesisSupported = ('speechSynthesis' in window) && (typeof window.SpeechSynthesisUtterance !== 'undefined');







  /**



   * Auto-injects the chatbot CSS stylesheet if not already loaded on the page.



   */



  // ==========================================



  // 2. STYLESHEET & IDENTITY HELPERS



  // Auto-loads stylesheet and reads authenticated user identity.



  // ==========================================







  /**



   * Auto-injects the chatbot CSS stylesheet if not already loaded on the page.



   *



   * Purpose:



   * Dynamically mounts chatbot.css so the chatbot widget can be safely mounted on any portal page.



   */



  function ensureStylesheet() {



    if (!document.getElementById('smartlearn-chatbot-css')) {



      const link = document.createElement('link');



      link.id = 'smartlearn-chatbot-css';



      link.rel = 'stylesheet';



      const isSubdir = window.location.pathname.includes('/student/') ||



                       window.location.pathname.includes('/instructor/') ||



                       window.location.pathname.includes('/admin/');



      link.href = isSubdir ? '../css/chatbot.css' : 'css/chatbot.css';



      document.head.appendChild(link);



    }



  }







  /**



   * Retrieves the active user profile from api client cache or localStorage.



   */



  function getUserInfo() {



    try {



      if (window.api && typeof window.api.getCurrentUser === 'function') {



        const u = window.api.getCurrentUser();



        if (u) return u;



      }



      const cached = localStorage.getItem('smartlearn_user');



      if (cached) return JSON.parse(cached);



    } catch (_) {}



    return { full_name: 'User', role: 'Student' };



  }







  /**



   * Resolves normalized Title-case role string ('Student', 'Instructor', or 'Admin').



   */



  function getUserRole() {



    const user = getUserInfo();



    const role = user.role || localStorage.getItem('smartlearn_role') || 'Student';



    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();



  }







  /**



   * Formats the current time into human-friendly 12-hour format (e.g. "10:45 AM").



   */



  function getFormattedTime() {



    const now = new Date();



    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });



  }







  /**



   * Escapes untrusted text to safe HTML entities.



   */



  function escapeHTML(str) {



    if (!str) return '';



    return str



      .replace(/&/g, '&amp;')



      .replace(/</g, '&lt;')



      .replace(/>/g, '&gt;')



      .replace(/"/g, '&quot;')



      .replace(/'/g, '&#039;');



  }







  // Role-Specific Quick Prompts



  const ROLE_PROMPTS = {



    Student: [



      { text: 'Explain my recommendations', icon: 'fa-compass' },



      { text: 'Summarize my skill gaps', icon: 'fa-layer-group' },



      { text: 'Generate a 5-question quiz', icon: 'fa-question-circle' },



      { text: 'Suggest learning path', icon: 'fa-road' }



    ],



    Instructor: [



      { text: 'Draft a course outline', icon: 'fa-file-lines' },



      { text: 'Suggest 3 quiz questions', icon: 'fa-list-check' },



      { text: 'Summarize student ratings', icon: 'fa-star' },



      { text: 'Suggest content improvements', icon: 'fa-wand-magic-sparkles' }



    ],



    Admin: [



      { text: 'Show platform statistics', icon: 'fa-chart-pie' },



      { text: 'Summarize enrollments & revenue', icon: 'fa-receipt' },



      { text: 'Popular courses leaderboard', icon: 'fa-trophy' },



      { text: 'Explain system completion rate', icon: 'fa-chart-line' }



    ]



  };







  // Role Metadata



  const ROLE_META = {



    Student: {



      title: 'SmartLearn AI Learning Coach',



      subtitle: 'Personalized Academic & Career Assistant',



      icon: 'fa-graduation-cap',



      welcome: 'Hello! I\'m your SmartLearn AI Learning Assistant. How can I help you today with your courses, skill gaps, or learning goals?'



    },



    Instructor: {



      title: 'SmartLearn AI Teaching Assistant',



      subtitle: 'Curriculum & Course Management Advisor',



      icon: 'fa-chalkboard-user',



      welcome: 'Hello! I\'m your SmartLearn AI Teaching Assistant. I can help you draft course content, lesson plans, quizzes, or analyze student feedback.'



    },



    Admin: {



      title: 'SmartLearn AI Admin Operations Assistant',



      subtitle: 'Platform Analytics & Operational Advisor',



      icon: 'fa-user-shield',



      welcome: 'Hello! I\'m your SmartLearn AI Admin Assistant. I can provide real-time platform metrics, enrollment statistics, and administrative insights.'



    }



  };







  /**



   * Applies continuous coordinates (x, y) relative to viewport,



   * enforcing strict boundaries so window remains fully inside visible screen.



   */



  // ==========================================



  // 3. 4-SCREEN REPOSITIONING & DRAGGABLE BEHAVIOR



  // Window placement (right, left, top, bottom), drag-and-drop, and coordinate persistence.



  // ==========================================







  /**



   * Applies pixel coordinates directly to the chatbot container.



   *



   * @param {number} x - Horizontal offset in pixels.



   * @param {number} y - Vertical offset in pixels.



   */



  function applyCustomCoordinates(x, y) {



    const windowEl = document.getElementById('smartlearn-chatbot-window');



    if (!windowEl) return null;







    const winWidth = windowEl.offsetWidth || 430;



    const winHeight = windowEl.offsetHeight || (isMinimized ? 56 : 640);







    const minX = 0;



    const minY = 0;



    const maxX = Math.max(0, window.innerWidth - winWidth);



    const maxY = Math.max(0, window.innerHeight - winHeight);







    const clampedX = Math.round(Math.min(Math.max(minX, x), maxX));



    const clampedY = Math.round(Math.min(Math.max(minY, y), maxY));







    windowEl.style.left = `${clampedX}px`;



    windowEl.style.top = `${clampedY}px`;



    windowEl.style.right = 'auto';



    windowEl.style.bottom = 'auto';



    windowEl.style.transform = 'none';



    windowEl.classList.add('has-custom-position');







    return { x: clampedX, y: clampedY };



  }







  /**



   * Persists custom drag coordinates into localStorage.



   */



  function saveCustomPosition(x, y) {



    const clamped = applyCustomCoordinates(x, y);



    if (clamped) {



      try {



        localStorage.setItem('smartlearn_chatbot_custom_coords', JSON.stringify(clamped));



        localStorage.setItem('smartlearn_chatbot_position', 'custom');



      } catch (_) {}



    }



  }







  /**



   * Restores previously saved position from localStorage.



   */



  function restoreSavedPosition() {



    if (window.innerWidth <= 768) {



      // Mobile uses responsive full-screen / bottom-sheet layout



      return;



    }







    const savedCoordsStr = localStorage.getItem('smartlearn_chatbot_custom_coords');



    if (savedCoordsStr) {



      try {



        const coords = JSON.parse(savedCoordsStr);



        if (typeof coords.x === 'number' && typeof coords.y === 'number' && !isNaN(coords.x) && !isNaN(coords.y)) {



          applyCustomCoordinates(coords.x, coords.y);



          return;



        }



      } catch (_) {}



    }







    applyPosition(currentPosition);



  }







  /**



   * Applies the chosen screen position dynamically (left, right, top, bottom).



   * Does NOT close the chatbot window.



   */



  function applyPosition(pos) {



    if (!['right', 'left', 'top', 'bottom'].includes(pos)) pos = 'right';



    currentPosition = pos;



    localStorage.setItem('smartlearn_chatbot_position', pos);



    try {



      localStorage.removeItem('smartlearn_chatbot_custom_coords');



    } catch (_) {}







    const windowEl = document.getElementById('smartlearn-chatbot-window');



    if (windowEl) {



      windowEl.classList.remove('has-custom-position');



      windowEl.style.left = '';



      windowEl.style.top = '';



      windowEl.style.right = '';



      windowEl.style.bottom = '';



      windowEl.style.transform = '';



    }







    const rootEl = document.getElementById('smartlearn-chatbot-root');



    if (rootEl) {



      rootEl.classList.remove('pos-right', 'pos-left', 'pos-top', 'pos-bottom');



      rootEl.classList.add(`pos-${pos}`);



    }







    // Update active check in position dropdown



    const options = document.querySelectorAll('.chatbot-pos-option');



    options.forEach(opt => {



      const optPos = opt.getAttribute('data-pos');



      const checkEl = opt.querySelector('.check-icon');



      if (optPos === pos) {



        opt.classList.add('active');



        if (checkEl) checkEl.style.display = 'inline-block';



      } else {



        opt.classList.remove('active');



        if (checkEl) checkEl.style.display = 'none';



      }



    });







    closePositionDropdown();



  }







  function togglePositionDropdown(e) {



    if (e) e.stopPropagation();



    const dropdown = document.getElementById('chatbot-pos-dropdown');



    if (dropdown) {



      dropdown.classList.toggle('open');



    }



  }







  function closePositionDropdown() {



    const dropdown = document.getElementById('chatbot-pos-dropdown');



    if (dropdown) dropdown.classList.remove('open');



  }







  /**



   * Sets up pointer-based drag-and-drop on the chatbot header.



   */



  function setupChatbotDragging(windowEl, headerEl) {



    if (!windowEl || !headerEl) return;







    let isDragging = false;



    let dragStartX = 0;



    let dragStartY = 0;



    let initialLeft = 0;



    let initialTop = 0;



    let hasMoved = false;



    let rafId = null;







    headerEl.addEventListener('pointerdown', (e) => {



      if (e.button !== 0) return; // Only main mouse button



      if (isMaximized) return; // No dragging while maximized



      if (window.innerWidth <= 768) return; // Responsive on mobile



      if (e.target.closest('.chatbot-header-btn, #chatbot-pos-dropdown, a, input, select, textarea')) {



        return;



      }







      isDragging = true;



      hasMoved = false;



      dragStartX = e.clientX;



      dragStartY = e.clientY;







      const rect = windowEl.getBoundingClientRect();



      initialLeft = rect.left;



      initialTop = rect.top;







      try {



        headerEl.setPointerCapture(e.pointerId);



      } catch (_) {}







      windowEl.classList.add('is-dragging');



      document.body.style.userSelect = 'none';



    });







    headerEl.addEventListener('pointermove', (e) => {



      if (!isDragging) return;







      const deltaX = e.clientX - dragStartX;



      const deltaY = e.clientY - dragStartY;







      if (!hasMoved && Math.hypot(deltaX, deltaY) < 3) {



        return;



      }



      hasMoved = true;







      const winWidth = windowEl.offsetWidth || 430;



      const winHeight = windowEl.offsetHeight || (isMinimized ? 56 : 640);







      const minX = 0;



      const minY = 0;



      const maxX = Math.max(0, window.innerWidth - winWidth);



      const maxY = Math.max(0, window.innerHeight - winHeight);







      const targetX = Math.round(Math.min(Math.max(minX, initialLeft + deltaX), maxX));



      const targetY = Math.round(Math.min(Math.max(minY, initialTop + deltaY), maxY));







      if (rafId) cancelAnimationFrame(rafId);



      rafId = requestAnimationFrame(() => {



        applyCustomCoordinates(targetX, targetY);



      });



    });







    const endDrag = (e) => {



      if (!isDragging) return;



      isDragging = false;



      windowEl.classList.remove('is-dragging');



      document.body.style.userSelect = '';







      try {



        headerEl.releasePointerCapture(e.pointerId);



      } catch (_) {}







      if (hasMoved) {



        const rect = windowEl.getBoundingClientRect();



        saveCustomPosition(rect.left, rect.top);



      }



    };







    headerEl.addEventListener('pointerup', endDrag);



    headerEl.addEventListener('pointercancel', endDrag);



  }







  /**



   * Window resize handler keeping custom position in bounds.



   */



  window.addEventListener('resize', () => {



    if (window.innerWidth <= 768) return;



    const savedCoordsStr = localStorage.getItem('smartlearn_chatbot_custom_coords');



    if (savedCoordsStr) {



      try {



        const coords = JSON.parse(savedCoordsStr);



        if (typeof coords.x === 'number' && typeof coords.y === 'number') {



          const clamped = applyCustomCoordinates(coords.x, coords.y);



          if (clamped) {



            localStorage.setItem('smartlearn_chatbot_custom_coords', JSON.stringify(clamped));



          }



        }



      } catch (_) {}



    }



  });







  /**



   * Toggles minimized state: collapses window so only header is visible.



   */



  // ==========================================



  // 4. WINDOW STATE CONTROLS (MINIMIZE / MAXIMIZE)



  // Toggles minimized pill and maximized wide view modes.



  // ==========================================







  /**



   * Toggles minimized state of chatbot window to a floating header pill.



   */



  function toggleMinimize() {



    const windowEl = document.getElementById('smartlearn-chatbot-window');



    const minBtn = document.getElementById('chatbot-minimize-btn');



    if (!windowEl) return;







    if (isMaximized) {



      toggleMaximize();



    }







    isMinimized = !isMinimized;



    if (isMinimized) {



      windowEl.classList.add('is-minimized');



      if (minBtn) {



        minBtn.innerHTML = '<i class="fa-solid fa-window-restore"></i>';



        minBtn.title = 'Restore Window';



        minBtn.setAttribute('aria-label', 'Restore Window');



      }



    } else {



      windowEl.classList.remove('is-minimized');



      if (minBtn) {



        minBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';



        minBtn.title = 'Minimize Window';



        minBtn.setAttribute('aria-label', 'Minimize Window');



      }



      if (windowEl.classList.contains('has-custom-position')) {



        const savedCoordsStr = localStorage.getItem('smartlearn_chatbot_custom_coords');



        if (savedCoordsStr) {



          try {



            const coords = JSON.parse(savedCoordsStr);



            applyCustomCoordinates(coords.x, coords.y);



          } catch (_) {}



        }



      }



      focusInput();



    }



  }







  /**



   * Toggles maximized state: expands window to near full-screen or wide view.



   */



  function toggleMaximize() {



    const windowEl = document.getElementById('smartlearn-chatbot-window');



    const maxBtn = document.getElementById('chatbot-maximize-btn');



    if (!windowEl) return;







    if (isMinimized) {



      toggleMinimize();



    }







    isMaximized = !isMaximized;



    if (isMaximized) {



      windowEl.classList.add('is-maximized');



      if (maxBtn) {



        maxBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';



        maxBtn.title = 'Restore Window Size';



        maxBtn.setAttribute('aria-label', 'Restore Window Size');



      }



    } else {



      windowEl.classList.remove('is-maximized');



      if (maxBtn) {



        maxBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';



        maxBtn.title = 'Maximize Window';



        maxBtn.setAttribute('aria-label', 'Maximize Window');



      }



      if (windowEl.classList.contains('has-custom-position')) {



        const savedCoordsStr = localStorage.getItem('smartlearn_chatbot_custom_coords');



        if (savedCoordsStr) {



          try {



            const coords = JSON.parse(savedCoordsStr);



            applyCustomCoordinates(coords.x, coords.y);



          } catch (_) {}



        }



      }



    }



  }







  /**



   * Updates the connection/status indicator pill in the header.



   */



  function updateStatus(status) {



    const statusEl = document.getElementById('chatbot-status-pill');



    if (!statusEl) return;







    statusEl.className = `chatbot-status-indicator ${status}`;



    if (status === 'thinking') {



      statusEl.innerHTML = `<span class="status-dot"></span><span>Thinking...</span>`;



    } else if (status === 'offline') {



      statusEl.innerHTML = `<span class="status-dot"></span><span>Offline</span>`;



    } else {



      statusEl.innerHTML = `<span class="status-dot"></span><span>AI Ready</span>`;



    }



  }







  /**



   * Synchronizes the microphone button icon, class, and accessibility attributes.



   */



  // ==========================================



  // 5. VOICE RECOGNITION (STT) & TEXT-TO-SPEECH (TTS)



  // Web Speech API, MediaRecorder fallback, audio stream cleanup, and voice playback.



  // ==========================================







  /**



   * Updates microphone button icon, active pulsing style, and aria attributes.



   *



   * @param {boolean} active - True when recording is active.



   */



  function updateMicButtonUI(active) {



    const micBtn = document.getElementById('chatbot-mic-btn');



    if (!micBtn) return;



    if (active) {



      micBtn.classList.add('listening');



      micBtn.innerHTML = '<i class="fa-solid fa-square"></i>';



      micBtn.title = 'Listening... Click to stop recording';



      micBtn.setAttribute('aria-label', 'Stop recording voice');



    } else {



      micBtn.classList.remove('listening');



      micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';



      micBtn.title = 'Voice Input (Speech to Text)';



      micBtn.setAttribute('aria-label', 'Voice Input');



    }



  }







  /**



   * Displays temporary status message inside the voice status banner.



   */



  function showVoiceStatus(message, type = 'info', autoHideMs = 5000) {



    const statusEl = document.getElementById('chatbot-voice-status');



    const textEl = document.getElementById('chatbot-voice-status-text');



    if (!statusEl || !textEl) return;







    if (voiceStatusTimeout) {



      clearTimeout(voiceStatusTimeout);



      voiceStatusTimeout = null;



    }







    textEl.textContent = message;



    statusEl.className = `chatbot-voice-status ${type === 'error' ? 'status-error' : ''}`;



    statusEl.style.display = 'flex';







    if (autoHideMs > 0) {



      voiceStatusTimeout = setTimeout(() => {



        hideVoiceStatus(true);



      }, autoHideMs);



    }



  }







  /**



   * Hides the voice status indicator banner.



   */



  function hideVoiceStatus(force = false) {



    const statusEl = document.getElementById('chatbot-voice-status');



    if (!statusEl) return;







    if (!force && statusEl.classList.contains('status-error')) {



      return;



    }







    statusEl.style.display = 'none';



    if (voiceStatusTimeout) {



      clearTimeout(voiceStatusTimeout);



      voiceStatusTimeout = null;



    }



  }







  /**



   * Focuses and positions cursor at the end of the chatbot textarea.



   */



  function focusInput() {



    const inputEl = document.getElementById('chatbot-input');



    if (inputEl) {



      inputEl.focus();



      inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;



    }



  }







  /**



   * Toggles speech-to-text recording state.



   */



  async function toggleSpeechRecognition() {



    if (isGenerating || isStarting || isTranscribingBackend) return;







    if (isListening) {



      userExplicitlyStopped = true;



      await stopSpeechRecognition(false);



    } else {



      await startSpeechRecognition();



    }



  }







  /**



   * Initializes and begins speech listening session.



   */



  async function startSpeechRecognition() {



    if (isGenerating || isStarting || isListening || isTranscribingBackend) return;







    stopTTS();







    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {



      showVoiceStatus('Voice recognition requires a secure connection (HTTPS or localhost).', 'error', 6000);



      return;



    }







    const inputEl = document.getElementById('chatbot-input');



    baseInputText = inputEl ? inputEl.value : '';



    activeTranscript = '';



    speechStarted = false;



    userExplicitlyStopped = false;



    noSpeechRetryCount = 0;



    browserSpeechSucceeded = false;



    recordedAudioChunks = [];







    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {



      showVoiceStatus('Microphone audio recording is not supported in this browser. Please type your message.', 'error', 6000);



      return;



    }







    try {



      isStarting = true;



      showVoiceStatus('Accessing microphone...', 'info', 0);



      activeMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });



    } catch (permErr) {



      isStarting = false;



      if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {



        showVoiceStatus('Microphone access was denied. Please allow microphone permissions in browser settings.', 'error', 7000);



      } else if (permErr.name === 'NotFoundError' || permErr.name === 'DevicesNotFoundError') {



        showVoiceStatus('No microphone detected. Please connect an audio input device.', 'error', 6000);



      } else if (permErr.name === 'NotReadableError' || permErr.name === 'TrackStartError') {



        showVoiceStatus('Microphone is in use by another application or blocked by system permissions.', 'error', 6000);



      } else {



        showVoiceStatus(`Microphone error: ${permErr.message || permErr.name}. You can type your question.`, 'error', 6000);



      }



      updateMicButtonUI(false);



      return;



    }







    if (typeof MediaRecorder !== 'undefined' && activeMediaStream) {



      let preferredMime = 'audio/webm';



      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {



        preferredMime = 'audio/webm;codecs=opus';



      } else if (MediaRecorder.isTypeSupported('audio/webm')) {



        preferredMime = 'audio/webm';



      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {



        preferredMime = 'audio/mp4';



      }







      try {



        activeMediaRecorder = new MediaRecorder(activeMediaStream, { mimeType: preferredMime });



        activeMediaRecorder.ondataavailable = (e) => {



          if (e.data && e.data.size > 0) {



            recordedAudioChunks.push(e.data);



          }



        };



        activeMediaRecorder.start(250);



      } catch (recInitErr) {



        activeMediaRecorder = null;



      }



    }







    isStarting = false;



    isListening = true;



    updateMicButtonUI(true);



    showVoiceStatus('Listening... Speak clearly into your microphone (Click Stop when finished)', 'info', 0);







    if (isSpeechRecognitionSupported) {



      if (recognition) {



        try {



          recognition.onstart = null;



          recognition.onsoundstart = null;



          recognition.onspeechstart = null;



          recognition.onspeechend = null;



          recognition.onresult = null;



          recognition.onerror = null;



          recognition.onend = null;



          recognition.abort();



        } catch (_) {}



        recognition = null;



      }







      try {



        recognition = new SpeechRecognitionClass();



        recognition.continuous = true;



        recognition.interimResults = true;



        recognition.maxAlternatives = 1;



        recognition.lang = navigator.language || 'en-US';







        recognition.onsoundstart = () => {



          if (!speechStarted) showVoiceStatus('Hearing audio... Speak now', 'info', 0);



        };







        recognition.onspeechstart = () => {



          speechStarted = true;



          showVoiceStatus('Hearing your voice... Speak now', 'info', 0);



        };







        recognition.onresult = (event) => {



          let interimTranscript = '';



          let finalTranscript = '';







          for (let i = 0; i < event.results.length; ++i) {



            const res = event.results[i];



            if (res.isFinal) {



              finalTranscript += res[0].transcript + ' ';



            } else {



              interimTranscript += res[0].transcript;



            }



          }







          const recognizedText = (finalTranscript + interimTranscript).trim();



          if (recognizedText) {



            browserSpeechSucceeded = true;



            speechStarted = true;



            activeTranscript = recognizedText;



            if (inputEl) {



              const prefix = baseInputText.trim() ? baseInputText.trim() + ' ' : '';



              inputEl.value = prefix + recognizedText;



              inputEl.style.height = 'auto';



              inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';



            }



            showVoiceStatus(`Listening: "${recognizedText.slice(-30)}"`, 'info', 0);



          }



        };







        recognition.onerror = (event) => {



          if (event.error === 'network' || event.error === 'service-not-allowed') {



            if (!speechStarted && !activeTranscript) {



              showVoiceStatus('Recording audio directly... Click Stop when finished.', 'info', 0);



            }



            return;



          }







          if (event.error === 'no-speech') {



            if (speechStarted && activeTranscript) return;



            if (!userExplicitlyStopped && isListening && noSpeechRetryCount < 3) {



              noSpeechRetryCount++;



              showVoiceStatus('Listening... Still waiting for speech', 'info', 0);



              return;



            }



            showVoiceStatus('No speech detected. Click mic to retry or type your message.', 'info', 0);



            return;



          }







          if (event.error === 'not-allowed') {



            userExplicitlyStopped = true;



            showVoiceStatus('Microphone permission denied. Please allow microphone access.', 'error', 7000);



            stopSpeechRecognition(false);



            return;



          }







          showVoiceStatus(`Voice input notice: ${event.error}. You can type your message.`, 'info', 5000);



        };







        recognition.onend = () => {



          if (isListening && !userExplicitlyStopped) {



            try {



              recognition.start();



            } catch (_) {}



          }



        };







        recognition.start();



      } catch (recInitErr) {



        recognition = null;



      }



    }



  }







  /**



   * Halts speech recognition and cleans up recording resources.



   */



  async function stopSpeechRecognition(silent = false) {



    isListening = false;



    isStarting = false;



    updateMicButtonUI(false);







    if (recognition) {



      try {



        recognition.onstart = null;



        recognition.onsoundstart = null;



        recognition.onspeechstart = null;



        recognition.onspeechend = null;



        recognition.onresult = null;



        recognition.onerror = null;



        recognition.onend = null;



        recognition.stop();



      } catch (_) {}



      recognition = null;



    }







    let audioBlob = null;



    if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {



      try {



        await new Promise((resolve) => {



          activeMediaRecorder.onstop = () => {



            if (recordedAudioChunks.length > 0) {



              const mime = activeMediaRecorder.mimeType || 'audio/webm';



              audioBlob = new Blob(recordedAudioChunks, { type: mime });



            }



            resolve();



          };



          activeMediaRecorder.stop();



        });



      } catch (_) {}



    }



    activeMediaRecorder = null;







    if (activeMediaStream) {



      try {



        activeMediaStream.getTracks().forEach(track => track.stop());



      } catch (_) {}



      activeMediaStream = null;



    }







    if (silent) {



      hideVoiceStatus(true);



      return;



    }







    if (browserSpeechSucceeded && activeTranscript) {



      showVoiceStatus('Voice recognized! Review or edit your question before sending.', 'info', 4000);



      focusInput();



      return;



    }







    if (audioBlob && audioBlob.size > 200) {



      try {



        isTranscribingBackend = true;



        showVoiceStatus('Transcribing speech with AI...', 'info', 0);







        if (window.api && typeof window.api.transcribeChatbotVoice === 'function') {



          const res = await window.api.transcribeChatbotVoice(audioBlob, 'recording.webm');



          isTranscribingBackend = false;







          if (res && res.transcript && res.transcript.trim()) {



            const transcript = res.transcript.trim();



            activeTranscript = transcript;



            const inputEl = document.getElementById('chatbot-input');



            if (inputEl) {



              const prefix = baseInputText.trim() ? baseInputText.trim() + ' ' : '';



              inputEl.value = prefix + transcript;



              inputEl.style.height = 'auto';



              inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';



            }



            showVoiceStatus('Voice transcribed! You can review or edit before sending.', 'info', 4000);



            focusInput();



            return;



          }



        }



      } catch (transcribeErr) {



        isTranscribingBackend = false;



        showVoiceStatus(`Voice service: ${transcribeErr.message || 'Could not process audio'}. Please type your question.`, 'error', 6000);



        focusInput();



        return;



      }



    }







    if (!activeTranscript) {



      showVoiceStatus('No speech detected. You can type your question in the chat box.', 'info', 4000);



      focusInput();



    }



  }







  // --- TEXT-TO-SPEECH (TTS) CONTROLS ---







  function stopTTS() {



    if (isSpeechSynthesisSupported && window.speechSynthesis.speaking) {



      try {



        window.speechSynthesis.cancel();



      } catch (_) {}



    }



    if (activeTtsBtn) {



      activeTtsBtn.classList.remove('speaking');



      activeTtsBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> <span>Read aloud</span>';



      activeTtsBtn.title = 'Read response aloud';



      activeTtsBtn = null;



    }



  }







  function toggleTTS(buttonEl, rawText) {



    if (!isSpeechSynthesisSupported) {



      showVoiceStatus('Text-to-speech is not supported in this browser.', 'error', 4000);



      return;



    }







    if (activeTtsBtn === buttonEl && window.speechSynthesis.speaking) {



      stopTTS();



      return;



    }







    stopTTS();



    if (isListening) stopSpeechRecognition(false);







    let cleanText = rawText



      .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')



      .replace(/`([^`]+)`/g, '$1')



      .replace(/\*\*([^*]+)\*\*/g, '$1')



      .replace(/\*([^*]+)\*/g, '$1')



      .replace(/#{1,6}\s+(.*)/g, '$1.')



      .replace(/[-*]\s+/g, '')



      .replace(/<[^>]*>/g, '')



      .trim();







    if (!cleanText) return;







    try {



      const utterance = new SpeechSynthesisUtterance(cleanText);



      utterance.rate = 1.0;



      utterance.pitch = 1.0;



      utterance.lang = 'en-US';







      activeTtsBtn = buttonEl;







      utterance.onstart = () => {



        buttonEl.classList.add('speaking');



        buttonEl.innerHTML = '<i class="fa-solid fa-stop"></i> <span>Stop</span>';



        buttonEl.title = 'Stop reading response';



      };







      utterance.onend = () => {



        stopTTS();



      };







      utterance.onerror = () => {



        stopTTS();



      };







      window.speechSynthesis.speak(utterance);



    } catch (_) {



      stopTTS();



    }



  }







  function cleanupAudioResources() {



    if (isListening || activeMediaStream) {



      stopSpeechRecognition(true);



    }



    stopTTS();



  }







  // --- THEME SYNCHRONIZATION ---







  // ==========================================



  // 6. MESSAGE RENDERING & MARKDOWN FORMATTING



  // Message bubbles, markdown parsing, typing indicators, and auto-scrolling.



  // ==========================================







  /**



   * Applies the user's active theme accent color to chatbot buttons and bubbles.



   */



  function applyThemeColors() {



    if (window.SmartLearnTheme && typeof window.SmartLearnTheme.getColors === 'function') {



      const colors = window.SmartLearnTheme.getColors();



      if (colors && colors.primary) {



        document.documentElement.style.setProperty('--cb-primary', colors.primary);



        document.documentElement.style.setProperty('--cb-primary-hover', colors.primaryHover || colors.primary);



      }



    }



  }







  /**



   * Resets the chat messages viewport to the default welcome state and role prompt chips.



   */



  function resetToWelcomeState() {



    const user = getUserInfo();



    const role = getUserRole();



    const meta = ROLE_META[role] || ROLE_META.Student;



    const prompts = ROLE_PROMPTS[role] || ROLE_PROMPTS.Student;



    const messagesEl = document.getElementById('chatbot-messages');







    if (!messagesEl) return;



    messagesEl.innerHTML = `



      <div class="chatbot-welcome-card" id="chatbot-welcome-card">



        <h4><i class="fa-solid fa-robot" style="color:var(--cb-primary);"></i> Welcome, ${escapeHTML(user.full_name || 'Learner')}!</h4>



        <p>${meta.welcome}</p>



        <div class="chatbot-quick-prompts">



          ${prompts.map(p => `



            <button type="button" class="chatbot-prompt-chip" data-prompt="${escapeHTML(p.text)}">



              <i class="fa-solid ${p.icon}"></i> ${escapeHTML(p.text)}



            </button>



          `).join('')}



        </div>



      </div>



    `;



  }







  /**



   * Enhanced Markdown formatter converting text to structured HTML.



   */



  function formatMarkdown(str) {



    if (!str) return '';



    let html = str



      .replace(/&/g, '&amp;')



      .replace(/</g, '&lt;')



      .replace(/>/g, '&gt;');







    // Code blocks ```code```



    html = html.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, function (_, lang, code) {



      return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;



    });







    // Inline code `code`



    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');







    // Bold **text**



    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');







    // Italics *text*



    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');







    // Headings



    html = html.replace(/^### (.*$)/gim, '<h4 style="margin: 8px 0 4px; font-size:13.5px; font-weight:700;">$1</h4>');



    html = html.replace(/^## (.*$)/gim, '<h3 style="margin: 10px 0 6px; font-size:14.5px; font-weight:700;">$1</h3>');



    html = html.replace(/^# (.*$)/gim, '<h2 style="margin: 12px 0 8px; font-size:15.5px; font-weight:800;">$1</h2>');







    // Bullet points



    html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');



    html = html.replace(/(<li>.*<\/li>)/gim, '<ul style="margin: 4px 0 8px 18px; padding:0;">$1</ul>');







    // Paragraphs



    const paragraphs = html.split(/\n\n+/);



    return paragraphs.map(p => {



      if (p.startsWith('<pre>') || p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<table>')) {



        return p;



      }



      return `<p>${p.replace(/\n/g, '<br>')}</p>`;



    }).join('');



  }







  /**



   * Appends a user or assistant message bubble to the messages viewport.



   */



  function appendMessageBubble(sender, text, timestamp = null) {



    const messagesEl = document.getElementById('chatbot-messages');



    if (!messagesEl) return;



    



    // Remove welcome card on first message submission



    const welcomeCard = document.getElementById('chatbot-welcome-card');



    if (welcomeCard && sender === 'user') {



      welcomeCard.remove();



    }







    const isUser = sender === 'user';



    const grp = document.createElement('div');



    grp.className = `chatbot-message-group ${isUser ? 'user' : 'assistant'}`;







    const formattedText = isUser



      ? text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')



      : formatMarkdown(text);







    const timeStr = timestamp || getFormattedTime();







    const ttsButtonHtml = (!isUser && isSpeechSynthesisSupported) ? `



      <div class="chatbot-bubble-actions">



        <button type="button" class="chatbot-tts-btn" title="Read response aloud" aria-label="Read response aloud">



          <i class="fa-solid fa-volume-high"></i>



          <span>Read aloud</span>



        </button>



      </div>



    ` : '';







    grp.innerHTML = `



      <div class="chatbot-sender-name-row">



        <span class="chatbot-sender-name">${isUser ? 'You' : 'AI Assistant'}</span>



        <span class="chatbot-msg-time">${timeStr}</span>



      </div>



      <div class="chatbot-bubble">



        ${formattedText}



      </div>



      ${ttsButtonHtml}



    `;







    messagesEl.appendChild(grp);







    // Bind TTS button event listener



    if (!isUser && isSpeechSynthesisSupported) {



      const ttsBtn = grp.querySelector('.chatbot-tts-btn');



      if (ttsBtn) {



        ttsBtn.addEventListener('click', () => toggleTTS(ttsBtn, text));



      }



    }







    scrollToBottom();



  }







  /**



   * Appends a user-friendly error bubble with a Retry action button.



   */



  function appendErrorMessageBubble(errorMessage, retryPrompt) {



    const messagesEl = document.getElementById('chatbot-messages');



    if (!messagesEl) return;







    const grp = document.createElement('div');



    grp.className = 'chatbot-message-group assistant';



    const timeStr = getFormattedTime();







    grp.innerHTML = `



      <div class="chatbot-sender-name-row">



        <span class="chatbot-sender-name">AI Assistant</span>



        <span class="chatbot-msg-time">${timeStr}</span>



      </div>



      <div class="chatbot-bubble is-error">



        <div><i class="fa-solid fa-triangle-exclamation"></i> <strong>AI Assistant Error:</strong> ${escapeHTML(errorMessage)}</div>



        <div class="chatbot-error-actions">



          <button type="button" class="chatbot-retry-btn" title="Retry sending prompt">



            <i class="fa-solid fa-rotate-right"></i> Retry



          </button>



        </div>



      </div>



    `;







    const retryBtn = grp.querySelector('.chatbot-retry-btn');



    if (retryBtn) {



      retryBtn.addEventListener('click', () => {



        grp.remove();



        sendMessage(retryPrompt);



      });



    }







    messagesEl.appendChild(grp);



    scrollToBottom();



  }







  function showTypingIndicator() {



    const messagesEl = document.getElementById('chatbot-messages');



    if (!messagesEl) return;



    const typing = document.createElement('div');



    typing.id = 'chatbot-typing-indicator';



    typing.className = 'chatbot-typing';



    typing.innerHTML = `



      <span class="typing-dot"></span>



      <span class="typing-dot"></span>



      <span class="typing-dot"></span>



      <span style="font-size:11.5px; color:var(--cb-text-muted); margin-left:4px;">AI is thinking...</span>



    `;



    messagesEl.appendChild(typing);



    scrollToBottom();



  }







  function hideTypingIndicator() {



    const typing = document.getElementById('chatbot-typing-indicator');



    if (typing) typing.remove();



  }







  function scrollToBottom() {



    const messagesEl = document.getElementById('chatbot-messages');



    if (messagesEl) {



      messagesEl.scrollTop = messagesEl.scrollHeight;



    }



  }







  /**



   * Dispatches the user's message to the backend API.



   */



  // ==========================================



  // 7. AI CHAT MESSAGING & CONVERSATION HISTORY



  // Submits prompts to backend AI, handles streaming/completions, and manages threads.



  // ==========================================







  /**



   * Sends user message to backend AI service (/chatbot/message) and displays completion.



   *



   * @param {string|null} [overrideText=null] - Optional prompt override text (used by retry buttons).



   * @returns {Promise<void>}



   *



   * Purpose:



   * Validates user input, displays user bubble, shows typing indicator, queries backend,



   * and renders the AI assistant response.



   *



   * Endpoint:



   * POST /chatbot/message



   *



   * Error handling / Debugging:



   * Network errors render a friendly error bubble with a 1-click retry button.



   */



  async function sendMessage(overrideText = null) {



    const inputEl = document.getElementById('chatbot-input');



    const sendBtn = document.getElementById('chatbot-send-btn');



    const micBtn = document.getElementById('chatbot-mic-btn');



    const text = overrideText !== null ? overrideText : (inputEl ? inputEl.value.trim() : '');







    if (!text || isGenerating) return;







    if (isListening) {



      userExplicitlyStopped = true;



      stopSpeechRecognition(false);



    }



    hideVoiceStatus(true);







    lastFailedMessage = text;



    isGenerating = true;



    updateStatus('thinking');







    if (inputEl) {



      inputEl.value = '';



      inputEl.style.height = 'auto';



    }



    if (sendBtn) sendBtn.disabled = true;



    if (micBtn) micBtn.disabled = true;







    appendMessageBubble('user', text);



    showTypingIndicator();







    try {



      if (!window.api || typeof window.api.sendChatbotMessage !== 'function') {



        throw new Error('Chatbot API service is not loaded.');



      }







      const res = await window.api.sendChatbotMessage(text, currentConversationId);



      hideTypingIndicator();







      if (res && res.conversation_id) {
        currentConversationId = res.conversation_id;
        try {
          sessionStorage.setItem('smartlearn_chatbot_active_conv', String(res.conversation_id));
        } catch (_) {}
      }







      if (res && res.ai_response) {



        appendMessageBubble('assistant', res.ai_response);



        updateStatus('online');



      } else {



        appendMessageBubble('assistant', 'No response received from AI service.');



        updateStatus('online');



      }



    } catch (err) {



      hideTypingIndicator();



      updateStatus('offline');



      const errMsg = err.message || 'An unexpected error occurred while communicating with the AI service.';



      appendErrorMessageBubble(errMsg, text);



    } finally {



      isGenerating = false;



      if (sendBtn) sendBtn.disabled = false;



      if (micBtn) micBtn.disabled = false;



      if (inputEl) inputEl.focus();



    }



  }







  // --- CONVERSATION HISTORY DRAWER ---







  
  async function restoreActiveOrLatestConversation() {
    try {
      if (!window.api || typeof window.api.getChatbotConversations !== 'function') return;

      let targetId = currentConversationId;
      if (!targetId) {
        try {
          const stored = sessionStorage.getItem('smartlearn_chatbot_active_conv');
          if (stored && !isNaN(Number(stored))) {
            targetId = Number(stored);
          }
        } catch (_) {}
      }

      if (targetId) {
        await loadSingleConversation(targetId);
        return;
      }

      const convs = await window.api.getChatbotConversations();
      if (convs && convs.length > 0) {
        await loadSingleConversation(convs[0].id);
      } else {
        loadConversationsHistory();
      }
    } catch (err) {
      console.warn('[SmartLearn Chatbot] Conversation restore note:', err);
    }
  }

  async function loadConversationsHistory() {



    const historyListEl = document.getElementById('chatbot-history-list');



    if (!historyListEl) return;







    try {



      if (!window.api || typeof window.api.getChatbotConversations !== 'function') {



        historyListEl.innerHTML = `<div style="text-align:center; padding:15px; color:var(--cb-text-muted); font-size:12px;">API unavailable</div>`;



        return;



      }







      const convs = await window.api.getChatbotConversations();



      if (!convs || convs.length === 0) {



        historyListEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--cb-text-muted); font-size:12px;">No past conversations found.</div>`;



        return;



      }







      historyListEl.innerHTML = convs.map(c => `



        <div class="history-item ${c.id === currentConversationId ? 'active' : ''}" data-conv-id="${c.id}">



          <div class="history-info">



            <span class="history-title">${escapeHTML(c.title || 'Untitled Conversation')}</span>



            <span class="history-date">${escapeHTML(c.created_at || '')}</span>



          </div>



          <button type="button" class="history-delete-btn" data-delete-id="${c.id}" title="Delete Conversation" aria-label="Delete Conversation">



            <i class="fa-solid fa-trash"></i>



          </button>



        </div>



      `).join('');







      historyListEl.querySelectorAll('.history-item').forEach(el => {



        el.addEventListener('click', (e) => {



          const deleteBtn = e.target.closest('.history-delete-btn');



          if (deleteBtn) {



            e.stopPropagation();



            const deleteId = deleteBtn.getAttribute('data-delete-id');



            deleteConversation(deleteId);



            return;



          }







          const convId = el.getAttribute('data-conv-id');



          if (convId) {



            loadSingleConversation(Number(convId));



          }



        });



      });



    } catch (_) {



      historyListEl.innerHTML = `<div style="text-align:center; padding:15px; color:#ef4444; font-size:12px;">Failed to load history</div>`;



    }



  }







  async function loadSingleConversation(convId) {



    const historyDrawer = document.getElementById('smartlearn-chatbot-history-drawer');



    const messagesEl = document.getElementById('chatbot-messages');







    try {



      const details = await window.api.getChatbotConversation(convId);
      currentConversationId = details.id;
      try {
        sessionStorage.setItem('smartlearn_chatbot_active_conv', String(details.id));
      } catch (_) {}



      if (historyDrawer) historyDrawer.classList.remove('open');



      cleanupAudioResources();







      if (messagesEl) {



        messagesEl.innerHTML = '';



        if (details.messages && details.messages.length > 0) {



          details.messages.forEach(m => {



            appendMessageBubble(m.sender, m.content, m.created_at);



          });



        } else {



          resetToWelcomeState();



        }



      }



      updateStatus('online');



    } catch (err) {



      alert('Failed to load conversation: ' + (err.message || 'Error'));



    }



  }







  async function deleteConversation(convId) {



    if (!confirm('Are you sure you want to delete this conversation?')) return;







    try {



      await window.api.deleteChatbotConversation(convId);



      if (currentConversationId === Number(convId)) {
        currentConversationId = null;
        try {
          sessionStorage.removeItem('smartlearn_chatbot_active_conv');
        } catch (_) {}
        cleanupAudioResources();
        resetToWelcomeState();
      }



      loadConversationsHistory();



    } catch (err) {



      alert('Failed to delete conversation: ' + (err.message || 'Error'));



    }



  }







  /**



   * Initiates a New Chat session with confirmation if current session contains messages.



   */



  function handleNewChat() {



    const messagesEl = document.getElementById('chatbot-messages');



    const hasMessages = messagesEl && messagesEl.querySelectorAll('.chatbot-message-group').length > 0;







    if (hasMessages) {



      const confirmed = confirm('Start a new chat session? Your current conversation will be saved in your chat history.');



      if (!confirmed) return;



    }







    currentConversationId = null;
    try {
      sessionStorage.removeItem('smartlearn_chatbot_active_conv');
    } catch (_) {}
    const historyDrawer = document.getElementById('smartlearn-chatbot-history-drawer');



    if (historyDrawer) historyDrawer.classList.remove('open');



    cleanupAudioResources();



    resetToWelcomeState();



    updateStatus('online');



    focusInput();



  }







  // --- RENDER HTML DOM STRUCTURE ---







  // ==========================================



  // 8. DOM TEMPLATE GENERATION & EVENT BINDINGS



  // Injects chatbot HTML structure and attaches keyboard, click, and drag listeners.



  // ==========================================







  /**



   * Mounts the chatbot launcher button, container window, and history drawer in the DOM.



   */



  function renderHTML() {



    if (document.getElementById('smartlearn-chatbot-toggle')) return;







    const user = getUserInfo();



    const role = getUserRole();



    const meta = ROLE_META[role] || ROLE_META.Student;



    const prompts = ROLE_PROMPTS[role] || ROLE_PROMPTS.Student;







    const container = document.createElement('div');



    container.id = 'smartlearn-chatbot-root';



    container.className = `pos-${currentPosition}`;







    container.innerHTML = `



      <!-- Floating Toggle Button -->



      <button type="button" id="smartlearn-chatbot-toggle" class="smartlearn-chatbot-toggle" aria-label="Toggle AI Assistant" title="Open SmartLearn AI Assistant">



        <i class="fa-solid fa-sparkles main-icon"></i>



        <span>AI Assistant</span>



        <span class="badge-dot"></span>



      </button>







      <!-- Floating Chat Window -->



      <div id="smartlearn-chatbot-window" class="smartlearn-chatbot-window" aria-hidden="true">



        



        <!-- Professional Header (Drag Handle) -->



        <div class="chatbot-header" id="chatbot-header-handle" title="Drag to reposition chatbot anywhere on the dashboard">



          <div class="header-info">



            <span class="chatbot-drag-handle-pill" title="Drag to move"><i class="fa-solid fa-grip-vertical"></i></span>



            <div class="avatar-icon"><i class="fa-solid ${meta.icon}"></i></div>



            <div class="header-titles">



              <div class="header-title-row">



                <h3 class="header-title">${meta.title}</h3>



                <span class="chatbot-status-indicator online" id="chatbot-status-pill" title="AI Assistant Status">



                  <span class="status-dot"></span>



                  <span>AI Ready</span>



                </span>



              </div>



              <span class="header-subtitle">${escapeHTML(user.full_name || 'User')} • ${role}</span>



            </div>



          </div>



          



          <!-- Header Action Controls -->



          <div class="chatbot-header-actions">



            <!-- Reposition Button -->



            <button type="button" class="chatbot-header-btn" id="chatbot-pos-btn" title="Reposition Chatbot (Left, Right, Top, Bottom)" aria-label="Reposition Chatbot">



              <i class="fa-solid fa-arrows-up-down-left-right"></i>



            </button>







            <!-- History Drawer Toggle -->



            <button type="button" class="chatbot-header-btn" id="chatbot-history-toggle-btn" title="Conversation History" aria-label="Conversation History">



              <i class="fa-solid fa-clock-rotate-left"></i>



            </button>







            <!-- New Chat Button -->



            <button type="button" class="chatbot-header-btn" id="chatbot-new-chat-btn" title="Start New Chat" aria-label="Start New Chat">



              <i class="fa-solid fa-plus"></i>



            </button>







            <!-- Minimize Button -->



            <button type="button" class="chatbot-header-btn" id="chatbot-minimize-btn" title="Minimize Window" aria-label="Minimize Window">



              <i class="fa-solid fa-minus"></i>



            </button>







            <!-- Maximize Button -->



            <button type="button" class="chatbot-header-btn" id="chatbot-maximize-btn" title="Maximize Window" aria-label="Maximize Window">



              <i class="fa-solid fa-expand"></i>



            </button>







            <!-- Close Button -->



            <button type="button" class="chatbot-header-btn" id="chatbot-close-btn" title="Close AI Assistant" aria-label="Close AI Assistant">



              <i class="fa-solid fa-xmark"></i>



            </button>



          </div>







          <!-- Position Selector Dropdown -->



          <div class="chatbot-pos-dropdown" id="chatbot-pos-dropdown">



            <div class="chatbot-pos-dropdown-header">Reposition Widget</div>



            <button type="button" class="chatbot-pos-option ${currentPosition === 'left' ? 'active' : ''}" data-pos="left">



              <span class="chatbot-pos-option-left"><i class="fa-solid fa-arrow-left"></i> Left</span>



              <i class="fa-solid fa-check check-icon" style="${currentPosition === 'left' ? 'display:inline-block;' : 'display:none;'}"></i>



            </button>



            <button type="button" class="chatbot-pos-option ${currentPosition === 'right' ? 'active' : ''}" data-pos="right">



              <span class="chatbot-pos-option-left"><i class="fa-solid fa-arrow-right"></i> Right</span>



              <i class="fa-solid fa-check check-icon" style="${currentPosition === 'right' ? 'display:inline-block;' : 'display:none;'}"></i>



            </button>



            <button type="button" class="chatbot-pos-option ${currentPosition === 'top' ? 'active' : ''}" data-pos="top">



              <span class="chatbot-pos-option-left"><i class="fa-solid fa-arrow-up"></i> Top</span>



              <i class="fa-solid fa-check check-icon" style="${currentPosition === 'top' ? 'display:inline-block;' : 'display:none;'}"></i>



            </button>



            <button type="button" class="chatbot-pos-option ${currentPosition === 'bottom' ? 'active' : ''}" data-pos="bottom">



              <span class="chatbot-pos-option-left"><i class="fa-solid fa-arrow-down"></i> Bottom</span>



              <i class="fa-solid fa-check check-icon" style="${currentPosition === 'bottom' ? 'display:inline-block;' : 'display:none;'}"></i>



            </button>



          </div>







        </div>







        <!-- History Side Drawer -->



        <div id="smartlearn-chatbot-history-drawer" class="chatbot-history-drawer">



          <div class="drawer-header">



            <h4><i class="fa-solid fa-clock-rotate-left mr-1"></i> Chat History</h4>



            <div style="display: flex; gap: 6px;">



              <button type="button" class="chatbot-header-btn" id="drawer-new-chat-btn" style="background:var(--cb-primary); color:#fff;" title="New Chat" aria-label="New Chat">



                <i class="fa-solid fa-plus"></i>



              </button>



              <button type="button" class="chatbot-header-btn" id="drawer-close-btn" style="background:var(--cb-border); color:var(--cb-text-main);" title="Close Drawer" aria-label="Close Drawer">



                <i class="fa-solid fa-xmark"></i>



              </button>



            </div>



          </div>



          <div class="drawer-body" id="chatbot-history-list">



            <div style="text-align:center; padding: 20px; color: var(--cb-text-muted); font-size:12px;">Loading chat history...</div>



          </div>



        </div>







        <!-- Messages Viewport -->



        <div class="chatbot-body" id="chatbot-messages">



          <div class="chatbot-welcome-card" id="chatbot-welcome-card">



            <h4><i class="fa-solid fa-robot" style="color:var(--cb-primary);"></i> Welcome, ${escapeHTML(user.full_name || 'Learner')}!</h4>



            <p>${meta.welcome}</p>



            <div class="chatbot-quick-prompts">



              ${prompts.map(p => `



                <button type="button" class="chatbot-prompt-chip" data-prompt="${escapeHTML(p.text)}">



                  <i class="fa-solid ${p.icon}"></i> ${escapeHTML(p.text)}



                </button>



              `).join('')}



            </div>



          </div>



        </div>







        <!-- Input Bar with Voice Controls -->



        <div class="chatbot-footer">



          <!-- Voice Listening Status Bar Banner -->



          <div id="chatbot-voice-status" class="chatbot-voice-status" style="display: none;" aria-live="polite">



            <div class="voice-status-content">



              <span class="voice-pulse-ring"></span>



              <span class="voice-wave-dot"></span>



              <span class="voice-wave-dot"></span>



              <span class="voice-wave-dot"></span>



              <span id="chatbot-voice-status-text">Listening... Speak clearly into your microphone</span>



            </div>



            <button type="button" id="chatbot-voice-cancel-btn" class="chatbot-voice-cancel-btn" title="Stop listening" aria-label="Stop listening">



              <i class="fa-solid fa-xmark"></i>



            </button>



          </div>







          <!-- Textarea Input Field -->



          <textarea id="chatbot-input" class="chatbot-textarea" rows="1" placeholder="${window.innerWidth <= 768 ? 'Ask AI Assistant...' : 'Ask AI Assistant... (Shift+Enter for newline)'}"></textarea>







          <!-- Voice Microphone Button -->



          <button type="button" id="chatbot-mic-btn" class="chatbot-mic-btn" title="Voice Input (Speech to Text)" aria-label="Voice Input">



            <i class="fa-solid fa-microphone"></i>



          </button>







          <!-- Send Message Button -->



          <button type="button" id="chatbot-send-btn" class="chatbot-send-btn" title="Send message" aria-label="Send message">



            <i class="fa-solid fa-paper-plane"></i>



          </button>



        </div>







      </div>



    `;







    document.body.appendChild(container);



    bindEvents();



    restoreSavedPosition();
    applyThemeColors();
    restoreActiveOrLatestConversation();



  }







  /**



   * Binds UI event listeners.



   */



  function bindEvents() {



    const toggleBtn = document.getElementById('smartlearn-chatbot-toggle');



    const closeBtn = document.getElementById('chatbot-close-btn');



    const minBtn = document.getElementById('chatbot-minimize-btn');



    const maxBtn = document.getElementById('chatbot-maximize-btn');



    const posBtn = document.getElementById('chatbot-pos-btn');



    const posDropdown = document.getElementById('chatbot-pos-dropdown');



    const windowEl = document.getElementById('smartlearn-chatbot-window');



    const headerEl = document.getElementById('chatbot-header-handle') || (windowEl ? windowEl.querySelector('.chatbot-header') : null);



    const historyBtn = document.getElementById('chatbot-history-toggle-btn');



    const historyDrawer = document.getElementById('smartlearn-chatbot-history-drawer');



    const drawerCloseBtn = document.getElementById('drawer-close-btn');



    const newChatBtn = document.getElementById('chatbot-new-chat-btn');



    const drawerNewChatBtn = document.getElementById('drawer-new-chat-btn');



    const inputEl = document.getElementById('chatbot-input');



    const sendBtn = document.getElementById('chatbot-send-btn');



    const micBtn = document.getElementById('chatbot-mic-btn');



    const voiceCancelBtn = document.getElementById('chatbot-voice-cancel-btn');



    const messagesEl = document.getElementById('chatbot-messages');







    // Setup Drag-and-Drop on the chatbot window header



    if (windowEl && headerEl) {



      setupChatbotDragging(windowEl, headerEl);



    }







    // Toggle Chat Window



    if (toggleBtn) {



      toggleBtn.addEventListener('click', () => {



        const isOpen = windowEl.classList.contains('open');



        if (isOpen) {



          windowEl.classList.remove('open');



          windowEl.setAttribute('aria-hidden', 'true');



          cleanupAudioResources();



          closePositionDropdown();



        } else {



          windowEl.classList.add('open');



          windowEl.setAttribute('aria-hidden', 'false');



          if (isMinimized) {



            toggleMinimize();



          }



          focusInput();
          if (currentConversationId === null) {
            restoreActiveOrLatestConversation();
          } else {
            loadConversationsHistory();
          }



        }



      });



    }







    // Close Button



    if (closeBtn) {



      closeBtn.addEventListener('click', () => {



        windowEl.classList.remove('open');



        windowEl.setAttribute('aria-hidden', 'true');



        cleanupAudioResources();



        closePositionDropdown();



      });



    }







    // Minimize & Maximize Buttons



    if (minBtn) minBtn.addEventListener('click', toggleMinimize);



    if (maxBtn) maxBtn.addEventListener('click', toggleMaximize);







    // Reposition Button & Options



    if (posBtn) {



      posBtn.addEventListener('click', (e) => togglePositionDropdown(e));



    }







    if (posDropdown) {



      posDropdown.querySelectorAll('.chatbot-pos-option').forEach(opt => {



        opt.addEventListener('click', (e) => {



          e.stopPropagation();



          const pos = opt.getAttribute('data-pos');



          if (pos) applyPosition(pos);



        });



      });



    }







    // Close dropdown on outside click



    document.addEventListener('click', (e) => {



      if (!e.target.closest('#chatbot-pos-btn') && !e.target.closest('#chatbot-pos-dropdown')) {



        closePositionDropdown();



      }



    });







    // Toggle History Drawer



    if (historyBtn) {



      historyBtn.addEventListener('click', () => {



        closePositionDropdown();



        historyDrawer.classList.toggle('open');



        if (historyDrawer.classList.contains('open')) {



          loadConversationsHistory();



        }



      });



    }







    if (drawerCloseBtn) {



      drawerCloseBtn.addEventListener('click', () => {



        historyDrawer.classList.remove('open');



      });



    }







    // New Chat Actions



    if (newChatBtn) newChatBtn.addEventListener('click', handleNewChat);



    if (drawerNewChatBtn) drawerNewChatBtn.addEventListener('click', handleNewChat);







    // Quick Prompt Chips Click Listener



    if (messagesEl) {



      messagesEl.addEventListener('click', (e) => {



        const chip = e.target.closest('.chatbot-prompt-chip');



        if (chip) {



          const text = chip.getAttribute('data-prompt');



          if (text) {



            inputEl.value = text;



            sendMessage();



          }



        }



      });



    }







    // Textarea Auto-grow on user input

    if (inputEl) {

      inputEl.addEventListener('input', () => {

        inputEl.style.height = 'auto';

        inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';

      });



      // Mobile Keyboard Focus: Keep conversation history visible and smoothly scroll

      inputEl.addEventListener('focus', () => {

        if (window.innerWidth <= 768) {

          setTimeout(() => {

            if (window.visualViewport) {

              const win = document.getElementById('smartlearn-chatbot-window');

              if (win) {

                win.style.setProperty('height', `${window.visualViewport.height}px`, 'important');

                win.style.setProperty('top', `${window.visualViewport.offsetTop}px`, 'important');

              }

            }

            scrollToBottom();

          }, 150);

        }

      });



      inputEl.addEventListener('blur', () => {

        if (window.innerWidth <= 768) {

          setTimeout(() => {

            const win = document.getElementById('smartlearn-chatbot-window');

            if (win && !win.classList.contains('has-custom-position')) {

              win.style.removeProperty('height');

              win.style.removeProperty('top');

            }

            scrollToBottom();

          }, 100);

        }

      });



      // Enter to send & Shift+Enter for newline

      inputEl.addEventListener('keydown', (e) => {

        if (e.key === 'Enter' && !e.shiftKey) {

          e.preventDefault();

          sendMessage();

        }

      });

    }



    // Global Visual Viewport Listener for mobile soft keyboard resizes

    if (window.visualViewport) {

      const handleVisualViewportResize = () => {

        const win = document.getElementById('smartlearn-chatbot-window');

        if (!win || !win.classList.contains('open') || window.innerWidth > 768) {

          if (win && window.innerWidth > 768) {

            win.style.removeProperty('height');

            win.style.removeProperty('top');

          }

          return;

        }

        const vv = window.visualViewport;

        win.style.setProperty('height', `${vv.height}px`, 'important');

        win.style.setProperty('top', `${vv.offsetTop}px`, 'important');

        scrollToBottom();

      };



      window.visualViewport.addEventListener('resize', handleVisualViewportResize);

      window.visualViewport.addEventListener('scroll', handleVisualViewportResize);

    }







    // Send Button Click



    if (sendBtn) {



      sendBtn.addEventListener('click', () => sendMessage());



    }







    // Voice Microphone Button Click



    if (micBtn) {



      micBtn.addEventListener('click', toggleSpeechRecognition);



    }







    // Voice Status Banner Cancel Button



    if (voiceCancelBtn) {



      voiceCancelBtn.addEventListener('click', () => {



        userExplicitlyStopped = true;



        stopSpeechRecognition(false);



      });



    }



  }







  // --- AUTOMATED TESTING & SIMULATION HOOKS ---



  if (typeof window !== 'undefined') {



    window.__simulateSpeechInput = function (text) {



      const inputEl = document.getElementById('chatbot-input');



      if (!inputEl) return false;



      const initial = inputEl.value ? inputEl.value.trim() + ' ' : '';



      inputEl.value = initial + text;



      inputEl.dispatchEvent(new Event('input', { bubbles: true }));



      inputEl.focus();



      inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;



      showVoiceStatus(`Voice transcribed: "${text}" (editable before sending)`, 'info', 4000);



      return true;



    };







    window.__simulateSpeechError = function (errorCode) {



      const errorMap = {



        'network': 'Browser cloud speech service is unreachable. You can type your question or use fallback voice input.',



        'not-allowed': 'Microphone permission denied. Please allow microphone access in browser settings.',



        'service-not-allowed': 'Speech recognition service is disabled by your browser or policy. Please type your message.',



        'no-speech': 'No speech was detected. Please speak closer to your microphone or click to retry.',



        'audio-capture': 'No microphone found or audio capture device is unavailable.',



        'unsupported': 'Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.'



      };



      const message = errorMap[errorCode] || `Speech recognition error: ${errorCode}`;



      showVoiceStatus(message, 'error', 6000);



      return { code: errorCode, message: message };



    };







    window.__setChatbotPosition = function (pos) {



      applyPosition(pos);



      return currentPosition;



    };







    window.__getChatbotPosition = function () {



      return currentPosition;



    };







    window.__setChatbotCoordinates = function (x, y) {



      saveCustomPosition(x, y);



      return window.__getChatbotCoordinates();



    };







    window.__getChatbotCoordinates = function () {



      const windowEl = document.getElementById('smartlearn-chatbot-window');



      if (!windowEl) return null;



      const rect = windowEl.getBoundingClientRect();



      return {



        x: rect.left,



        y: rect.top,



        width: rect.width,



        height: rect.height,



        isCustom: windowEl.classList.contains('has-custom-position'),



        isMinimized: isMinimized,



        isMaximized: isMaximized



      };



    };







    window.__resetChatbotPosition = function () {



      applyPosition('right');



      return window.__getChatbotCoordinates();



    };



  }







  // --- INITIALIZATION ---



  function init() {



    ensureStylesheet();



    if (document.readyState === 'loading') {



      document.addEventListener('DOMContentLoaded', renderHTML);



    } else {



      renderHTML();



    }



  }







  init();







})();



