/**
 * SmartLearn Checkout & Razorpay Integration
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth check
    const user = window.api ? window.api.getCurrentUser() : null;
    if (!user) {
        window.location.replace('../login.html');
        return;
    }

    // Populate Sidebar User Info
    const sbName = document.getElementById('sidebarName');
    const sbRole = document.getElementById('sidebarRole');
    const sbAvatar = document.getElementById('sidebarAvatar');
    const topName = document.getElementById('topName');
    const topAvatar = document.getElementById('topAvatar');
    const studentDisplayName = document.getElementById('studentDisplayName');
    const studentDisplayEmail = document.getElementById('studentDisplayEmail');

    if (sbName) sbName.textContent = user.full_name || 'Student';
    if (sbRole) sbRole.textContent = user.role || 'Student';
    if (topName) topName.textContent = user.full_name || 'Student';
    if (studentDisplayName) studentDisplayName.textContent = user.full_name || 'Student';
    if (studentDisplayEmail) studentDisplayEmail.textContent = user.email || '';

    const initials = (user.full_name || 'ST').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    if (sbAvatar) sbAvatar.textContent = initials;
    if (topAvatar) topAvatar.textContent = initials;

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.api.logout();
        });
    }

    // Menu toggle for mobile
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    // 2. Parse course ID from URL query params
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id') || urlParams.get('course_id');

    if (!courseId) {
        showError('No course specified for checkout.', 'Please select a course from the course catalog.');
        return;
    }

    // State
    let currentCourse = null;
    let selectedPaymentMethod = 'Card';
    let currentOrderData = null;
    let isProcessing = false;

    // Elements
    const loadingEl = document.getElementById('checkoutLoading');
    const errorEl = document.getElementById('checkoutError');
    const mainContainer = document.getElementById('checkoutMainContainer');
    const successContainer = document.getElementById('paymentSuccessContainer');
    const cancelContainer = document.getElementById('paymentCancelledContainer');
    const backLinkToCourse = document.getElementById('backLinkToCourse');
    const btnCancelTop = document.getElementById('btnCancelCheckoutTop');
    const btnPayNow = document.getElementById('btnPayNow');
    const payBtnText = document.getElementById('payBtnText');
    const processingBanner = document.getElementById('paymentProcessingBanner');

    if (backLinkToCourse) backLinkToCourse.href = `course-details.html?id=${courseId}`;
    if (btnCancelTop) btnCancelTop.href = `course-details.html?id=${courseId}`;

    // 3. Load Course Details from Backend
    try {
        currentCourse = await window.api.getCourseDetails(courseId);
        if (!currentCourse) {
            showError('Course Not Found', 'The requested course could not be found.');
            return;
        }

        // Check if already enrolled
        if (currentCourse.is_enrolled) {
            showAlreadyEnrolled(currentCourse);
            return;
        }

        // Check if free course
        const isFree = currentCourse.is_free !== 0 && currentCourse.is_free !== false && (!currentCourse.price || Number(currentCourse.price) === 0);
        if (isFree) {
            // Free course should not open payment checkout
            alert('This is a free course. Enrolling you directly...');
            await window.api.enrollCourse(currentCourse.id);
            window.location.replace('my-courses.html');
            return;
        }

        // Render Course & Price Summary
        renderCourseSummary(currentCourse);

        // Hide loading, show main container
        if (loadingEl) loadingEl.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'block';

    } catch (err) {
        console.error('Failed to load course for checkout:', err);
        showError('Failed to Load Course', err.message || 'Error connecting to SmartLearn server.');
        return;
    }

    // 4. Setup Payment Method Selection
    setupPaymentMethodSelection();

    // 5. Setup Pay Now Button Handler
    if (btnPayNow) {
        btnPayNow.addEventListener('click', async () => {
            if (isProcessing) return;
            await initiatePaymentFlow();
        });
    }

    // Setup Retry Button Handler
    const btnRetry = document.getElementById('btnRetryPayment');
    if (btnRetry) {
        btnRetry.addEventListener('click', () => {
            if (cancelContainer) cancelContainer.style.display = 'none';
            if (mainContainer) mainContainer.style.display = 'block';
            resetPayButton();
        });
    }

    const btnBackToCourseCancel = document.getElementById('btnBackToCourseCancel');
    if (btnBackToCourseCancel) {
        btnBackToCourseCancel.href = `course-details.html?id=${courseId}`;
    }

    // Helper: Render Course and Price Summary
    function renderCourseSummary(c) {
        const titleEl = document.getElementById('courseSummaryTitle');
        const catBadge = document.getElementById('courseCategoryBadge');
        const instName = document.getElementById('courseInstructorName');
        const levelVal = document.getElementById('courseLevelVal');
        const durVal = document.getElementById('courseDurationVal');
        const lessonsVal = document.getElementById('courseLessonsVal');
        const thumbPreview = document.getElementById('courseThumbPreview');

        if (titleEl) titleEl.textContent = c.title;
        if (catBadge) catBadge.textContent = c.category || 'Course';
        if (instName) instName.textContent = c.instructor || c.instructor_name || 'SmartLearn Faculty';
        if (levelVal) levelVal.textContent = c.level || c.difficulty || 'Intermediate';
        if (durVal) durVal.textContent = c.duration || '30 hours';

        const totalLessons = (c.modules || []).reduce((acc, m) => acc + (m.lessons || []).length, 0) || 24;
        if (lessonsVal) lessonsVal.textContent = `${totalLessons} lessons`;

        if (thumbPreview) {
            if (c.thumbnail_url) {
                thumbPreview.style.backgroundImage = `url('${c.thumbnail_url}')`;
                thumbPreview.innerHTML = '';
            } else {
                thumbPreview.style.background = c.color_theme || 'linear-gradient(135deg, #5B3FE8, #8B4AD9)';
                thumbPreview.innerHTML = `<i class="${c.icon || 'fa-solid fa-graduation-cap'}"></i>`;
            }
        }

        // Price calculations
        const basePrice = Number(c.price || 0);
        const taxRate = 0.18; // 18% GST
        const taxAmount = Math.round(basePrice * taxRate * 100) / 100;
        const discount = 0.00;
        const totalPrice = Math.round((basePrice + taxAmount - discount) * 100) / 100;

        const baseEl = document.getElementById('summaryBasePrice');
        const taxEl = document.getElementById('summaryTaxPrice');
        const discEl = document.getElementById('summaryDiscountPrice');
        const totalEl = document.getElementById('summaryTotalPrice');

        if (baseEl) baseEl.textContent = `₹${basePrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (taxEl) taxEl.textContent = `₹${taxAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (discEl) discEl.textContent = `-₹${discount.toFixed(2)}`;
        if (totalEl) totalEl.textContent = `₹${totalPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        if (payBtnText) {
            payBtnText.textContent = `Pay ₹${totalPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }
    }

    // Helper: Payment Method Selection
    function setupPaymentMethodSelection() {
        const selector = document.getElementById('paymentMethodSelector');
        const methodDetailContent = document.getElementById('methodDetailContent');
        if (!selector) return;

        const pills = selector.querySelectorAll('.pay-method-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                selectedPaymentMethod = pill.dataset.method || 'Card';

                // Update detail explanation text
                if (methodDetailContent) {
                    if (selectedPaymentMethod === 'Card') {
                        methodDetailContent.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.35rem;">
                                <i class="fa-solid fa-credit-card" style="color: var(--primary-purple); font-size: 18px;"></i>
                                <strong style="color: var(--dark-navy); font-size: 14px;">Credit / Debit Card</strong>
                            </div>
                            <p style="font-size: 12.5px; color: #64748b; margin: 0;">
                                Supports Visa, MasterCard, RuPay, Maestro & American Express. Fast and secure checkout with 3D Secure OTP verification.
                            </p>
                        `;
                    } else if (selectedPaymentMethod === 'UPI') {
                        methodDetailContent.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.35rem;">
                                <i class="fa-solid fa-mobile-screen-button" style="color: var(--primary-purple); font-size: 18px;"></i>
                                <strong style="color: var(--dark-navy); font-size: 14px;">UPI / QR Code</strong>
                            </div>
                            <p style="font-size: 12.5px; color: #64748b; margin: 0;">
                                Pay instantly via Google Pay, PhonePe, Paytm, BHIM or any UPI App with Instant Payment Confirmation.
                            </p>
                        `;
                    } else if (selectedPaymentMethod === 'Net Banking') {
                        methodDetailContent.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.35rem;">
                                <i class="fa-solid fa-building-columns" style="color: var(--primary-purple); font-size: 18px;"></i>
                                <strong style="color: var(--dark-navy); font-size: 14px;">Net Banking</strong>
                            </div>
                            <p style="font-size: 12.5px; color: #64748b; margin: 0;">
                                Direct bank transfer supported for 50+ major Indian banks including HDFC, ICICI, SBI, Axis, Kotak and more.
                            </p>
                        `;
                    } else if (selectedPaymentMethod === 'Wallet') {
                        methodDetailContent.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.35rem;">
                                <i class="fa-solid fa-wallet" style="color: var(--primary-purple); font-size: 18px;"></i>
                                <strong style="color: var(--dark-navy); font-size: 14px;">Digital Wallets</strong>
                            </div>
                            <p style="font-size: 12.5px; color: #64748b; margin: 0;">
                                Quick 1-click checkout using Paytm Wallet, PhonePe Wallet, MobiKwik, Airtel Money, or Amazon Pay.
                            </p>
                        `;
                    }
                }
            });
        });
    }

    // Helper: Initiate Payment Flow
    async function initiatePaymentFlow() {
        if (!currentCourse) return;

        setProcessingState(true);

        try {
            // 1. Create order on backend
            currentOrderData = await window.api.createPaymentOrder(currentCourse.id, selectedPaymentMethod);
            if (!currentOrderData || !currentOrderData.order_id) {
                throw new Error('Could not create payment order.');
            }

            // 2. Open Razorpay Checkout Gateway
            openRazorpayGateway(currentOrderData);

        } catch (err) {
            console.error('Order creation error:', err);
            setProcessingState(false);
            alert('Payment initialization failed: ' + (err.message || 'Please try again.'));
        }
    }

    function setProcessingState(processing) {
        isProcessing = processing;
        if (btnPayNow) {
            btnPayNow.disabled = processing;
            if (processing) {
                btnPayNow.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Processing Payment...`;
                btnPayNow.style.opacity = '0.75';
                btnPayNow.style.cursor = 'not-allowed';
            } else {
                resetPayButton();
            }
        }
        if (processingBanner) {
            processingBanner.style.display = processing ? 'block' : 'none';
        }
    }

    function resetPayButton() {
        if (btnPayNow && currentCourse) {
            const basePrice = Number(currentCourse.price || 0);
            const taxAmount = Math.round(basePrice * 0.18 * 100) / 100;
            const totalPrice = Math.round((basePrice + taxAmount) * 100) / 100;
            btnPayNow.disabled = false;
            btnPayNow.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> <span>Pay ₹${totalPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>`;
            btnPayNow.style.opacity = '1';
            btnPayNow.style.cursor = 'pointer';
        }
    }

    // Open Real Razorpay Checkout Modal
    function openRazorpayGateway(orderData) {
        if (typeof window.Razorpay !== 'function') {
            setProcessingState(false);
            showError('Razorpay Checkout Unavailable', 'Could not load Razorpay payment SDK. Please check your internet connection and refresh the page.');
            return;
        }

        const options = {
            key: orderData.key_id || 'rzp_test_TS3V8ct5L5sNFk',
            amount: orderData.amount_paise,
            currency: orderData.currency || 'INR',
            name: 'SmartLearn',
            description: `${orderData.course?.title || currentCourse.title} - Enrollment`,
            image: 'https://cdn-icons-png.flaticon.com/512/3135/3135755.png',
            prefill: {
                name: orderData.customer?.name || user.full_name || '',
                email: orderData.customer?.email || user.email || '',
                contact: orderData.customer?.contact || ''
            },
            notes: {
                course_id: String(currentCourse.id),
                student_id: String(user.id),
                course_title: currentCourse.title
            },
            theme: {
                color: '#5B3FE8'
            },
            handler: async function (response) {
                console.log('[SmartLearn Razorpay] Payment response:', response);
                await handlePaymentSuccessVerification({
                    course_id: currentCourse.id,
                    razorpay_order_id: response.razorpay_order_id || orderData.order_id,
                    razorpay_payment_id: response.razorpay_payment_id || `pay_${Date.now()}`,
                    razorpay_signature: response.razorpay_signature || `rzp_sig_${orderData.order_id}_${response.razorpay_payment_id || Date.now()}`,
                    payment_method: selectedPaymentMethod
                });
            },
            modal: {
                ondismiss: function () {
                    console.log('[SmartLearn Razorpay] Checkout dismissed/cancelled by user.');
                    handlePaymentCancelled(orderData.order_id);
                }
            }
        };

        // Only supply order_id if it was verified and generated directly on Razorpay's server
        if (orderData.is_rzp_server_order && orderData.order_id) {
            options.order_id = orderData.order_id;
        }

        try {
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response) {
                console.error('[SmartLearn Razorpay] Payment failed event:', response);
                handlePaymentFailed(orderData.order_id, response.error?.description || response.error?.reason || 'Payment Failed');
            });
            rzp.open();
        } catch (err) {
            console.error('Razorpay Checkout open error:', err);
            setProcessingState(false);
            showError('Payment Gateway Error', 'Could not open Razorpay checkout: ' + (err.message || 'Please try again.'));
        }
    }

    // Backend Payment Verification Handler
    async function handlePaymentSuccessVerification(verifyPayload) {
        setProcessingState(true);
        if (processingBanner) {
            processingBanner.style.display = 'block';
            processingBanner.innerHTML = `
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 24px; color: #10B981; margin-bottom: 0.5rem;"></i>
                <div style="font-weight: 700; color: var(--dark-navy); font-size: 14px;">Verifying Payment with SmartLearn Server...</div>
                <div style="font-size: 12px; color: var(--secondary-text);">Authenticating cryptographic signature and activating course access.</div>
            `;
        }

        try {
            const verifyRes = await window.api.verifyPayment(verifyPayload);

            if (verifyRes && verifyRes.success) {
                // Render Payment Successful View
                renderSuccessView(verifyRes);
            } else {
                throw new Error(verifyRes?.message || 'Payment verification was rejected by server.');
            }
        } catch (err) {
            console.error('Payment verification failed:', err);
            handlePaymentFailed(verifyPayload.razorpay_order_id, err.message || 'Payment signature verification failed.');
        } finally {
            setProcessingState(false);
        }
    }

    function renderSuccessView(data) {
        if (mainContainer) mainContainer.style.display = 'none';
        if (cancelContainer) cancelContainer.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
        if (successContainer) successContainer.style.display = 'block';

        const titleEl = document.getElementById('successCourseTitle');
        const amountEl = document.getElementById('successAmountPaid');
        const txnIdEl = document.getElementById('successTxnId');
        const orderIdEl = document.getElementById('successOrderId');
        const methodEl = document.getElementById('successPayMethod');
        const dateEl = document.getElementById('successPayDate');
        const btnStart = document.getElementById('btnStartLearningSuccess');

        if (titleEl) titleEl.textContent = data.course_title || currentCourse.title;
        if (amountEl) amountEl.textContent = `₹${Number(data.amount || currentCourse.price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (txnIdEl) txnIdEl.textContent = data.payment_id || data.transaction_id || `TXN${Date.now()}`;
        if (orderIdEl) orderIdEl.textContent = data.order_id || currentOrderData?.order_id || 'N/A';
        if (methodEl) methodEl.textContent = data.payment_method || selectedPaymentMethod;
        if (dateEl) dateEl.textContent = data.payment_date || new Date().toLocaleString();

        if (btnStart) {
            btnStart.href = `course-player.html?id=${data.course_id || currentCourse.id}`;
        }
    }

    async function handlePaymentFailed(orderId, reason) {
        setProcessingState(false);
        try {
            await window.api.recordPaymentFailed({
                course_id: currentCourse.id,
                razorpay_order_id: orderId,
                reason: reason,
                payment_method: selectedPaymentMethod
            });
        } catch (_) {}

        if (mainContainer) mainContainer.style.display = 'none';
        if (successContainer) successContainer.style.display = 'none';
        if (cancelContainer) {
            cancelContainer.style.display = 'block';
            const iconWrap = document.getElementById('cancelIconWrap');
            const icon = document.getElementById('cancelIcon');
            const title = document.getElementById('cancelStateTitle');
            const desc = document.getElementById('cancelStateDesc');
            
            if (iconWrap) {
                iconWrap.style.background = '#FEE2E2';
                iconWrap.style.color = '#EF4444';
            }
            if (icon) {
                icon.className = 'fa-solid fa-circle-xmark';
            }
            if (title) title.textContent = 'Payment Failed';
            if (desc) desc.textContent = `Your payment could not be completed (${reason || 'Authorization Error'}). Please try again.`;
        }
    }

    async function handlePaymentCancelled(orderId) {
        setProcessingState(false);
        try {
            await window.api.recordPaymentCancel({
                course_id: currentCourse.id,
                razorpay_order_id: orderId
            });
        } catch (_) {}

        if (mainContainer) mainContainer.style.display = 'none';
        if (successContainer) successContainer.style.display = 'none';
        if (cancelContainer) {
            cancelContainer.style.display = 'block';
            const iconWrap = document.getElementById('cancelIconWrap');
            const icon = document.getElementById('cancelIcon');
            const title = document.getElementById('cancelStateTitle');
            const desc = document.getElementById('cancelStateDesc');

            if (iconWrap) {
                iconWrap.style.background = '#FEF3C7';
                iconWrap.style.color = '#D97706';
            }
            if (icon) {
                icon.className = 'fa-solid fa-triangle-exclamation';
            }
            if (title) title.textContent = 'Payment Cancelled';
            if (desc) desc.textContent = 'Your payment was cancelled. No amount was deducted and no enrollment was created.';
        }
    }

    function showAlreadyEnrolled(course) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'none';
        if (errorEl) {
            errorEl.style.display = 'block';
            const msg = document.getElementById('checkoutErrorMessage');
            const detail = document.getElementById('checkoutErrorDetail');
            const btnGoMyCourses = document.getElementById('btnGoMyCoursesOnError');
            if (msg) msg.textContent = 'Already Enrolled!';
            if (detail) detail.textContent = `You are already enrolled in "${course.title}". You can continue learning immediately.`;
            if (btnGoMyCourses) {
                btnGoMyCourses.style.display = 'inline-block';
                btnGoMyCourses.href = `course-player.html?id=${course.id}`;
                btnGoMyCourses.textContent = 'Continue Learning →';
            }
        }
    }

    function showError(title, message) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'none';
        if (errorEl) {
            errorEl.style.display = 'block';
            const msg = document.getElementById('checkoutErrorMessage');
            const detail = document.getElementById('checkoutErrorDetail');
            if (msg) msg.textContent = title;
            if (detail) detail.textContent = message;
        }
    }
});
