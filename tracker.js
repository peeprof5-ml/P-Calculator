/**
 * P-Calculator Pro - Tracker.js / Core Script (Updated with Lifecycle Sync & Admin Block Handlers)
 */

const countriesList = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
    "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia",
    "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada",
    "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia",
    "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
    "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia",
    "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guyana", "Haiti", "Honduras",
    "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica",
    "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon",
    "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives",
    "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro",
    "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger",
    "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Panama", "Papua New Guinea", "Paraguay",
    "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia",
    "Samoa", "San Marino", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia",
    "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden",
    "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago",
    "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
    "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

window._mockSubmissions = window._mockSubmissions || [];

document.addEventListener('DOMContentLoaded', () => {
    checkLifeTrackerStatus();

    const savedUser = localStorage.getItem('pcalc_user');
    const paymentApproved = localStorage.getItem('pcalc_paid');
    const sessionActive = sessionStorage.getItem('pcalc_session_active');

    if (savedUser) {
        if (sessionActive === 'true') {
            if (paymentApproved === 'true') {
                switchView('view-main');
            } else {
                switchView('view-payment');
            }
        } else {
            switchView('view-password-prompt');
        }
    } else {
        switchView('view-signin');
    }

    setInterval(pollAppStatus, 4000);
});

function checkLifeTrackerStatus() {
    const trackerKey = 'pcalc_lifecycle_start';
    const now = Date.now();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

    let startDate = localStorage.getItem(trackerKey);

    if (!startDate) {
        localStorage.setItem(trackerKey, now.toString());
        startDate = now;
    }

    const elapsedTime = now - parseInt(startDate, 10);

    if (elapsedTime >= thirtyDaysInMs) {
        triggerAutoBlock("Your 30-day life cycle has expired. Access blocked.");
    }
}

function triggerAutoBlock(reason) {
    sessionStorage.removeItem('pcalc_session_active');
    localStorage.setItem('pcalc_paid', 'false');
    switchView('view-payment');
    
    const statusMsg = document.getElementById('payment-status-msg');
    if (statusMsg) statusMsg.innerText = reason;
    showToast(reason);
}

async function pollAppStatus() {
    const currentView = document.querySelector('.app-view.active')?.id;
    const userData = JSON.parse(localStorage.getItem('pcalc_user') || '{}');

    if (userData.name) {
        const submissions = window._mockSubmissions;
        const userSub = submissions.find(sub => sub.user.includes(userData.name));
        
        if (userSub) {
            // Check if admin manually blocked the user
            if (userSub.status === 'Blocked') {
                triggerAutoBlock("Access manually revoked by Admin.");
                return;
            }

            // Check if admin approved the payment
            if (currentView === 'view-payment' && userSub.status === 'Approved') {
                localStorage.setItem('pcalc_paid', 'true');
                showToast("Payment verified & approved!");
                setTimeout(() => switchView('view-main'), 1000);
            }
        }
    }
}

function switchView(viewId) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
}

function signOutUser() {
    sessionStorage.removeItem('pcalc_session_active');
    const promptPass = document.getElementById('prompt-password');
    if (promptPass) promptPass.value = '';
    switchView('view-password-prompt');
    showToast("Signed out");
}

function showModal(text) {
    const modalText = document.getElementById('modal-text');
    const glassModal = document.getElementById('glass-modal');
    if (modalText) modalText.innerText = text;
    if (glassModal) glassModal.style.display = 'flex';
}

function closeModal() {
    const glassModal = document.getElementById('glass-modal');
    if (glassModal) glassModal.style.display = 'none';
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function submitPaymentProof() {
    const fileInput = document.getElementById('payment-screenshot');
    if (!fileInput || fileInput.files.length === 0) {
        showModal("Please upload your payment screenshot proof.");
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const userData = JSON.parse(localStorage.getItem('pcalc_user') || '{}');
        const paymentPayload = {
            id: Date.now(),
            user: userData.name ? `${userData.name} (${userData.country || 'Unknown'})` : 'Anonymous User',
            plan: 'Pro Pack',
            amount: '$50.00',
            screenshot: e.target.result,
            status: 'Pending',
            lifecycleStart: Date.now()
        };

        window._mockSubmissions.push(paymentPayload);
        const statusMsg = document.getElementById('payment-status-msg');
        if (statusMsg) statusMsg.innerText = "Payment submitted! Awaiting admin approval...";
        showToast("Proof uploaded successfully");
    };
    reader.readAsDataURL(file);
}

