document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;
    let profileData = null;
    try {
        currentUser = await window.api.getMe();
        profileData = await window.api.getProfile().catch(() => ({}));

        const fullName = currentUser.full_name || 'Student';
        document.getElementById('topName') && (document.getElementById('topName').textContent = fullName);
        document.getElementById('sidebarName') && (document.getElementById('sidebarName').textContent = fullName);

        const names = fullName.trim().split(' ');
        let initials = names[0].charAt(0);
        if (names.length > 1) initials += names[1].charAt(0);
        initials = initials.toUpperCase();

        if (profileData && profileData.profile_image) {
            const imgUrl = window.api.getImageUrl(profileData.profile_image);
            const imgTag = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile">`;
            document.getElementById('topAvatar') && (document.getElementById('topAvatar').innerHTML = imgTag);
            document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').innerHTML = imgTag);
        } else {
            document.getElementById('topAvatar') && (document.getElementById('topAvatar').textContent = initials);
            document.getElementById('sidebarAvatar') && (document.getElementById('sidebarAvatar').textContent = initials);
        }
    } catch (e) {
        window.location.href = '../login.html';
        return;
    }

    // Toggle & Logout
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('dashboardSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => { sidebar.classList.add('active'); overlay.classList.add('active'); });
        overlay.addEventListener('click', () => { sidebar.classList.remove('active'); overlay.classList.remove('active'); });
    }
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.api.clearToken();
        window.location.href = '../login.html';
    });

    const grid = document.getElementById('wishlistGrid');
    if (grid) {
        try {
            const items = await window.api.getWishlist();
            if (items.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state-card" style="grid-column: 1 / -1;">
                        <div class="empty-icon"><i class="fa-regular fa-heart"></i></div>
                        <h4>Your wishlist is empty</h4>
                        <p>Explore recommended courses and click the heart icon to save courses for later.</p>
                        <a href="courses.html" class="btn-primary-small" style="display:inline-block; margin-top:1rem; text-decoration:none;">Browse Catalog →</a>
                    </div>
                `;
            } else {
                grid.innerHTML = items.map(c => `
                    <div class="rec-card">
                        <div>
                            <div class="rec-header">
                                <span class="rec-category-badge">${c.category}</span>
                                <span class="rec-match-pill">⭐ ${c.rating}</span>
                            </div>
                            <h3 class="rec-title">${c.title}</h3>
                            <div class="rec-meta">
                                <span><i class="fa-solid fa-clock"></i> ${c.duration}</span>
                                <span><i class="fa-solid fa-layer-group"></i> ${c.level}</span>
                                <span><i class="fa-solid fa-chalkboard-user"></i> ${c.instructor}</span>
                            </div>
                            <div class="rec-skills">${(c.skills || []).map(s => `<span class="rec-skill-tag">${s}</span>`).join('')}</div>
                        </div>
                        <div class="rec-footer" style="display:flex; justify-content:space-between; align-items:center;">
                            <button onclick="removeFromWishlist(${c.id})" class="btn-action-icon danger" title="Remove from Wishlist"><i class="fa-solid fa-trash-can"></i></button>
                            <a href="course-details.html?id=${c.id}" class="btn-primary-small" style="text-decoration:none; padding:0.4rem 0.9rem;">View Course →</a>
                        </div>
                    </div>
                `).join('');
            }
        } catch (err) {
            grid.innerHTML = `<p style="color:#EF4444; grid-column:1/-1;">${err.message}</p>`;
        }
    }
});

async function removeFromWishlist(courseId) {
    try {
        await window.api.toggleWishlist(courseId);
        window.location.reload();
    } catch (e) {
        alert('Action failed: ' + e.message);
    }
}
