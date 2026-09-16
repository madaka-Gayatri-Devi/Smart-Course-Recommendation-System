/**
 * Student Payment History Script
 */

document.addEventListener('DOMContentLoaded', async () => {
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

    if (sbName) sbName.textContent = user.full_name || 'Student';
    if (sbRole) sbRole.textContent = user.role || 'Student';
    if (topName) topName.textContent = user.full_name || 'Student';

    const initials = (user.full_name || 'ST').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    if (sbAvatar) sbAvatar.textContent = initials;
    if (topAvatar) topAvatar.textContent = initials;

    // Logout
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

    let allPayments = [];
    const tableBody = document.getElementById('paymentHistoryTableBody');
    const searchInput = document.getElementById('txSearchInput');
    const statusFilter = document.getElementById('statusFilter');
    const countBadge = document.getElementById('recordCountBadge');
    const statTotal = document.getElementById('statTotalTxns');
    const statSuccess = document.getElementById('statSuccessTxns');
    const statSpent = document.getElementById('statTotalSpent');

    try {
        allPayments = await window.api.getMyPaymentHistory();
        renderPaymentStats();
        renderPaymentsTable();
    } catch (err) {
        console.error('Failed to load payment history:', err);
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2.5rem; color: #EF4444;">
                        <i class="fa-solid fa-circle-exclamation mr-1"></i> Failed to load payments: ${err.message || 'Error connecting to server.'}
                    </td>
                </tr>
            `;
        }
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => renderPaymentsTable());
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', () => renderPaymentsTable());
    }

    function renderPaymentStats() {
        const total = allPayments.length;
        const successful = allPayments.filter(p => (p.status || '').toLowerCase() === 'successful');
        const totalAmountSpent = successful.reduce((sum, p) => sum + Number(p.amount || 0), 0);

        if (statTotal) statTotal.textContent = total;
        if (statSuccess) statSuccess.textContent = successful.length;
        if (statSpent) statSpent.textContent = `₹${totalAmountSpent.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }

    function renderPaymentsTable() {
        if (!tableBody) return;

        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const filterVal = statusFilter ? statusFilter.value.toLowerCase() : 'all';

        let filtered = allPayments.filter(p => {
            const matchesQuery = !query || 
                (p.course_title || '').toLowerCase().includes(query) ||
                (p.transaction_id || '').toLowerCase().includes(query) ||
                (p.razorpay_order_id || '').toLowerCase().includes(query);

            const matchesStatus = filterVal === 'all' || (p.status || '').toLowerCase() === filterVal;
            return matchesQuery && matchesStatus;
        });

        if (countBadge) countBadge.textContent = `${filtered.length} of ${allPayments.length} records`;

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 3rem 1.5rem; color: #64748B;">
                        <div style="font-size: 28px; color: #CBD5E1; margin-bottom: 0.5rem;"><i class="fa-solid fa-receipt"></i></div>
                        <h4 style="color: var(--dark-navy); margin-bottom: 0.25rem;">No payment records found</h4>
                        <p style="font-size: 13px; margin: 0;">${query || filterVal !== 'all' ? 'Try changing your search or filter settings.' : 'You have not made any course purchases yet.'}</p>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filtered.map(p => {
            const statusLower = (p.status || 'successful').toLowerCase();
            let statusBadge = `<span style="display:inline-block; font-size:12px; font-weight:700; color:#059669; background:#ECFDF5; padding:3px 10px; border-radius:12px; border:1px solid #A7F3D0;"><i class="fa-solid fa-circle-check mr-1"></i> Successful</span>`;

            if (statusLower === 'failed') {
                statusBadge = `<span style="display:inline-block; font-size:12px; font-weight:700; color:#DC2626; background:#FEF2F2; padding:3px 10px; border-radius:12px; border:1px solid #FECACA;"><i class="fa-solid fa-circle-xmark mr-1"></i> Failed</span>`;
            } else if (statusLower === 'cancelled') {
                statusBadge = `<span style="display:inline-block; font-size:12px; font-weight:700; color:#D97706; background:#FFFBEB; padding:3px 10px; border-radius:12px; border:1px solid #FDE68A;"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Cancelled</span>`;
            } else if (statusLower === 'pending') {
                statusBadge = `<span style="display:inline-block; font-size:12px; font-weight:700; color:#4F46E5; background:#EEF2FF; padding:3px 10px; border-radius:12px; border:1px solid #C7D2FE;"><i class="fa-solid fa-clock mr-1"></i> Pending</span>`;
            }

            const methodIcon = p.payment_method === 'UPI' ? 'fa-mobile-screen-button' : (p.payment_method === 'Net Banking' ? 'fa-building-columns' : (p.payment_method === 'Wallet' ? 'fa-wallet' : 'fa-credit-card'));

            return `
                <tr style="border-bottom: 1px solid #F1F5F9;">
                    <td style="padding: 1rem 1.25rem;">
                        <div style="font-weight: 700; color: var(--dark-navy);">${escapeHtml(p.course_title || 'Course')}</div>
                        <div style="font-size: 11.5px; color: #64748B;">${escapeHtml(p.instructor || 'SmartLearn')} • ${escapeHtml(p.category || 'Curriculum')}</div>
                    </td>
                    <td style="padding: 1rem 1rem;">
                        <code style="background: #F8FAFC; padding: 2px 6px; border-radius: 4px; border: 1px solid #E2E8F0; font-size: 12px; color: var(--dark-navy); font-weight: 600;">${escapeHtml(p.transaction_id || 'N/A')}</code>
                    </td>
                    <td style="padding: 1rem 1rem; color: #475569; font-size: 13px;">
                        ${escapeHtml(p.payment_date || 'Recent')}
                    </td>
                    <td style="padding: 1rem 1rem;">
                        <strong style="color: var(--dark-navy); font-size: 14px;">₹${Number(p.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                    </td>
                    <td style="padding: 1rem 1rem;">
                        <span style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 12.5px; color: #475569; background: #F1F5F9; padding: 2px 8px; border-radius: 6px;">
                            <i class="fa-solid ${methodIcon}" style="color: var(--primary-purple);"></i> ${escapeHtml(p.payment_method || 'Card')}
                        </span>
                    </td>
                    <td style="padding: 1rem 1rem;">
                        ${statusBadge}
                    </td>
                    <td style="padding: 1rem 1.25rem; text-align: right;">
                        <button type="button" onclick="window.viewPaymentReceiptModal(${p.id})" style="padding: 0.4rem 0.85rem; font-size: 12.5px; font-weight: 600; border: 1px solid #CBD5E1; background: #FFFFFF; color: var(--primary-purple); border-radius: 6px; cursor: pointer; transition: all 0.2s;">
                            <i class="fa-solid fa-receipt mr-1"></i> View Details
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Modal View Handler
    window.viewPaymentReceiptModal = async function(paymentId) {
        const modal = document.getElementById('paymentDetailsModal');
        const bodyEl = document.getElementById('modalReceiptBody');
        const courseBtn = document.getElementById('modalCourseLinkBtn');
        if (!modal || !bodyEl) return;

        modal.style.display = 'flex';
        bodyEl.innerHTML = `
            <div style="text-align: center; padding: 2.5rem; color: #94A3B8;">
                <i class="fa-solid fa-spinner fa-spin fa-2x" style="color: var(--primary-purple); margin-bottom: 0.5rem;"></i>
                <p>Loading transaction details...</p>
            </div>
        `;

        try {
            const data = await window.api.getPaymentDetails(paymentId);
            
            const isSuccess = (data.status || '').toLowerCase() === 'successful';
            const statusColor = isSuccess ? '#059669' : ((data.status || '').toLowerCase() === 'failed' ? '#DC2626' : '#D97706');

            bodyEl.innerHTML = `
                <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 1.25rem; margin-bottom: 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem; border-bottom: 1px solid #E2E8F0; padding-bottom: 0.5rem;">
                        <span style="color: #64748B;">Payment Status:</span>
                        <strong style="color: ${statusColor}; text-transform: uppercase;">${escapeHtml(data.status || 'Successful')}</strong>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
                        <div>
                            <span style="font-size: 11.5px; color: #64748B;">Transaction ID</span>
                            <div style="font-weight: 700; color: var(--dark-navy);">${escapeHtml(data.transaction_id || 'N/A')}</div>
                        </div>
                        <div>
                            <span style="font-size: 11.5px; color: #64748B;">Payment Date</span>
                            <div style="font-weight: 600; color: var(--dark-navy);">${escapeHtml(data.payment_date || 'N/A')}</div>
                        </div>
                        <div>
                            <span style="font-size: 11.5px; color: #64748B;">Razorpay Order ID</span>
                            <div style="font-family: monospace; color: #475569; font-size: 12px;">${escapeHtml(data.razorpay_order_id || 'N/A')}</div>
                        </div>
                        <div>
                            <span style="font-size: 11.5px; color: #64748B;">Razorpay Payment ID</span>
                            <div style="font-family: monospace; color: #475569; font-size: 12px;">${escapeHtml(data.razorpay_payment_id || 'N/A')}</div>
                        </div>
                    </div>

                    <div style="border-top: 1px solid #E2E8F0; padding-top: 0.75rem; margin-top: 0.5rem;">
                        <span style="font-size: 11.5px; color: #64748B;">Purchased Curriculum</span>
                        <div style="font-size: 14px; font-weight: 700; color: var(--dark-navy);">${escapeHtml(data.course_title || 'Course')}</div>
                        <div style="font-size: 12px; color: #64748B;">Instructor: ${escapeHtml(data.instructor || 'SmartLearn Faculty')} (Course ID: #${data.course_id})</div>
                    </div>
                </div>

                <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 1.25rem;">
                    <div style="font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; margin-bottom: 0.65rem;">Price Breakdown</div>
                    
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; color: #475569;">
                        <span>Course Base Price</span>
                        <span>₹${Number(data.base_amount || 0).toFixed(2)}</span>
                    </div>

                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; color: #475569;">
                        <span>GST (18%)</span>
                        <span>₹${Number(data.tax_amount || 0).toFixed(2)}</span>
                    </div>

                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.65rem; color: #059669;">
                        <span>Discount</span>
                        <span>-₹${Number(data.discount_amount || 0).toFixed(2)}</span>
                    </div>

                    <div style="display: flex; justify-content: space-between; padding-top: 0.65rem; border-top: 1px dashed #CBD5E1; font-weight: 800; font-size: 15px; color: var(--dark-navy);">
                        <span>Total Paid</span>
                        <span style="color: var(--primary-purple);">₹${Number(data.total_amount || 0).toFixed(2)}</span>
                    </div>

                    <div style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid #F1F5F9; display: flex; justify-content: space-between; font-size: 12px; color: #64748B;">
                        <span>Payment Method: <strong>${escapeHtml(data.payment_method || 'Card')}</strong></span>
                        <span>Enrollment Status: <strong style="color: #059669;">${escapeHtml(data.enrollment_status || 'Active')}</strong></span>
                    </div>
                </div>
            `;

            if (courseBtn) {
                courseBtn.href = isSuccess ? `course-player.html?id=${data.course_id}` : `course-details.html?id=${data.course_id}`;
                courseBtn.textContent = isSuccess ? 'Continue Learning →' : 'View Course →';
            }

        } catch (err) {
            bodyEl.innerHTML = `<p style="color: #EF4444; text-align: center; padding: 2rem;">Error: ${err.message || 'Could not load details.'}</p>`;
        }
    };

    window.closePaymentDetailsModal = function() {
        const modal = document.getElementById('paymentDetailsModal');
        if (modal) modal.style.display = 'none';
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
