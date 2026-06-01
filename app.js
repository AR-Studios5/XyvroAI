// ==========================================
// 1. STATE INITIALIZATION & CONFIG MATRIX
// ==========================================
const SUPPORT_EMAIL = 'xyvroentertainment@gmail.com';

const toast = document.getElementById('status-toast');
if (toast) {
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

if (typeof lucide !== 'undefined') lucide.createIcons();

let currentSession = null;
let profileData = null; 
let chatMessages = []; 
let currentBase64Image = null;

const LIMITS = {
    guest: { messages: 10, images: 1, delay: 3000 },
    normal: { messages: 50, images: 10, delay: 2000 },
    subscribed: { messages: 500, images: 50, delay: 0 }
};

// ==========================================
// 2. GUEST PERSISTENCE CACHE (Anti-Loophole)
// ==========================================
function getGuestUsage() {
    const today = new Date().toISOString().split('T')[0];
    let stored = localStorage.getItem('xyvro_guest_session');
    if (stored) {
        let data = JSON.parse(stored);
        if (data.date === today) return data;
    }
    return { date: today, messages: 0, images: 0 };
}

function saveGuestUsage(messages, images) {
    const today = new Date().toISOString().split('T')[0];
    const data = { date: today, messages, images };
    localStorage.setItem('xyvro_guest_session', JSON.stringify(data));
}

function purgeLocalUserData() {
    console.log("Purging tracking registers and resetting memory variables...");
    localStorage.removeItem('xyvro_guest_session');
    if (currentSession?.user?.id) {
        localStorage.removeItem(`xyvro_history_${currentSession.user.id}`);
    }
    chatMessages = [];
    currentBase64Image = null;
    profileData = null;
    const container = document.getElementById('chat-container');
    if (container) container.innerHTML = '';
}

// ==========================================
// 3. LAYER NAVIGATION CONTROLLER
// ==========================================
function navigate(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('settings-dropdown').classList.add('hidden'); 
    const target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');
}

function checkLegalRequirements(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox || !checkbox.checked) {
        alert("You must agree to the T&C and Payment Policy to proceed.");
        return false;
    }
    return true;
}

function generateDefaultAvatarUrl(name = "X") {
    const initial = name.charAt(0).toUpperCase();
    return `https://api.dicebear.com/8.x/initials/svg?seed=${initial}&radius=50&backgroundColor=2563eb`;
}

function applyAvatarToUI(imgUrl) {
    const finalUrl = imgUrl || generateDefaultAvatarUrl(profileData?.username);
    ['profile-trigger', 'profile-avatar-image'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.src = finalUrl;
    });
}

function saveToHistory(msg) {
    const historyMsg = {...msg};
    if (historyMsg.type === 'user' && historyMsg.image) historyMsg.image = '(Image Attached)';
    chatMessages.push(historyMsg);
    localStorage.setItem(`xyvro_history_${currentSession?.user.id}`, JSON.stringify(chatMessages));
}

function loadHistory() {
    chatMessages = JSON.parse(localStorage.getItem(`xyvro_history_${currentSession?.user.id}`)) || [];
    const container = document.getElementById('chat-container');
    container.innerHTML = ''; 
    chatMessages.forEach(msg => appendMessageUI(msg, false)); 
    initChatGreeting(false); 
}

// ==========================================
// 4. METADATA PROFILE ENGINE
// ==========================================
function updateProfileUI() {
    if (!profileData) return;
    const name = profileData.username || "User Account";
    const email = profileData.email || "No Email Provided";
    const tier = profileData.tier || 'guest';

    applyAvatarToUI(profileData.avatar_url);
    document.getElementById('profile-name-display').textContent = name;
    document.getElementById('profile-email-display').textContent = email;
    
    const tierBadge = document.getElementById('profile-tier-badge');
    const expiryNote = document.getElementById('sub-expiry-note');
    
    tierBadge.textContent = `XyvroAI ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
    
    if (tier === 'subscribed') {
        tierBadge.style.backgroundColor = '#10b981'; 
        tierBadge.style.color = '#fff';
        if (profileData.subscription_expires_at) {
            const expDate = new Date(profileData.subscription_expires_at).toLocaleDateString();
            expiryNote.textContent = `Valid until: ${expDate}`;
        } else {
            expiryNote.textContent = 'Pro Plan Active';
        }
    } else {
        tierBadge.style.backgroundColor = ''; 
        tierBadge.style.color = '';
        expiryNote.textContent = 'Free Tier Account';
    }
}

function initChatGreeting(shouldSave = true) {
    const container = document.getElementById('chat-container');
    if (!container || (container.children.length > 0 && shouldSave)) return; 
    
    const name = profileData?.username?.split(' ')[0] || "Explorer";
    const msgData = { type: 'ai', content: `Hello ${name}. Welcome to XyvroAI. How can I assist you today?` };
    appendMessageUI(msgData);
    if (shouldSave && profileData?.tier !== 'guest') saveToHistory(msgData);
}

function showAiThinking(message = "Analyzing...") {
    const container = document.getElementById('chat-container');
    const msgData = { type: 'ai', content: message, isThinking: true };
    const el = appendMessageUI(msgData);
    container.scrollTop = container.scrollHeight;
    return el; 
}

function appendMessageUI(msg, animate = true) {
    const container = document.getElementById('chat-container');
    if (!container) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${msg.type === 'ai' ? 'ai-message' : 'user-message'}`;
    if (msg.isThinking) msgDiv.id = 'ai-thinking-indicator';

    if (msg.image) {
        const imgEl = document.createElement('img');
        imgEl.src = msg.image;
        msgDiv.appendChild(imgEl);
    }
    if (msg.content) {
        const textDiv = document.createElement('div');
        textDiv.textContent = msg.content;
        msgDiv.appendChild(textDiv);
    }

    container.appendChild(msgDiv);
    if (animate) container.scrollTop = container.scrollHeight;
    return msgDiv;
}

function triggerQuotaModal(title, message, displayMode) {
    document.getElementById('settings-dropdown').classList.add('hidden');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-desc').textContent = message;
    
    const signUpBtn = document.getElementById('modal-signup-btn');
    const upgradeBtn = document.getElementById('modal-upgrade-btn');
    
    if (displayMode === 'guest') {
        signUpBtn.classList.remove('hidden');
        upgradeBtn.classList.add('hidden');
    } else {
        signUpBtn.classList.add('hidden');
        upgradeBtn.classList.remove('hidden');
    }
    document.getElementById('quota-modal').classList.remove('hidden');
}

// ==========================================
// 5. ATTACHMENT PIPELINES
// ==========================================
const chatAttachBtn = document.getElementById('chat-attach-btn');
const chatFileUpload = document.getElementById('chat-file-upload');
const chatPreviewContainer = document.getElementById('chat-image-preview-container');
const chatImagePreview = document.getElementById('chat-image-preview');
const chatRemoveImageBtn = document.getElementById('chat-remove-image-btn');

chatAttachBtn.onclick = () => chatFileUpload.click();

chatFileUpload.onchange = function(e) {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) return alert('Please upload an image file.');
        if (file.size > 5000000) return alert('Image too large. Keep it under 5MB.');

        const reader = new FileReader();
        reader.onload = function(event) {
            currentBase64Image = event.target.result;
            chatImagePreview.src = currentBase64Image;
            chatPreviewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
};

chatRemoveImageBtn.onclick = () => {
    currentBase64Image = null;
    chatImagePreview.src = '';
    chatPreviewContainer.classList.add('hidden');
    chatFileUpload.value = '';
};
// ==========================================
// 6. EVENT HUB INTERCEPTORS
// ==========================================
document.getElementById('profile-trigger').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('settings-dropdown').classList.toggle('hidden');
};

window.onclick = () => document.getElementById('settings-dropdown').classList.add('hidden');
document.getElementById('view-profile-btn').onclick = (e) => { e.preventDefault(); navigate('profile-screen'); };

document.getElementById('clear-history-btn').onclick = (e) => {
    e.preventDefault();
    if (confirm("Are you sure you want to clear your entire chat history locally?")) {
        localStorage.removeItem(`xyvro_history_${currentSession?.user.id}`);
        chatMessages = [];
        loadHistory();
        alert("History cleared.");
    }
};

const themeSwitch = document.getElementById('theme-switch');
if (localStorage.getItem('xyvro_theme') === 'dark') {
    document.body.classList.replace('light-theme', 'dark-theme');
    themeSwitch.checked = true;
}
themeSwitch.onchange = () => {
    if (themeSwitch.checked) {
        document.body.classList.replace('light-theme', 'dark-theme');
        localStorage.setItem('xyvro_theme', 'dark');
    } else {
        document.body.classList.replace('dark-theme', 'light-theme');
        localStorage.setItem('xyvro_theme', 'light');
    }
};

const editNameBtn = document.getElementById('edit-name-btn');
const nameDisplay = document.getElementById('profile-name-display');
const nameInputGroup = document.getElementById('name-input-group');
const nameInput = document.getElementById('profile-name-input');
const saveNameBtn = document.getElementById('save-name-btn');

editNameBtn.onclick = () => {
    nameDisplay.classList.add('hidden');
    editNameBtn.classList.add('hidden');
    nameInputGroup.classList.remove('hidden');
    nameInput.value = nameDisplay.textContent;
    nameInput.focus();
};

saveNameBtn.onclick = async () => {
    const newName = nameInput.value.trim();
    if (!newName) return alert("Name cannot be blank.");
    nameDisplay.classList.remove('hidden');
    editNameBtn.classList.remove('hidden');
    nameInputGroup.classList.add('hidden');
    if (newName === profileData?.username) return;

    nameDisplay.textContent = newName;
    profileData.username = newName;
    applyAvatarToUI(profileData.avatar_url);

    if (typeof supabaseClient !== 'undefined' && currentSession) {
        await supabaseClient.auth.updateUser({ data: { full_name: newName } });
    }
};

const changeAvatarBtn = document.getElementById('change-avatar-btn');
const avatarUpload = document.getElementById('avatar-upload');
changeAvatarBtn.onclick = () => avatarUpload.click();
avatarUpload.onchange = function(e) {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) return alert('Please upload an image file.');
        const reader = new FileReader();
        reader.onload = async function(event) {
            const base64Avatar = event.target.result;
            profileData.avatar_url = base64Avatar;
            applyAvatarToUI(base64Avatar);
            if (typeof supabaseClient !== 'undefined' && currentSession) {
                await supabaseClient.auth.updateUser({ data: { avatar_url: base64Avatar } });
            }
        };
        reader.readAsDataURL(file);
    }
};

function bindProdNavigation() {
    safeOnclick('modal-signup-btn', () => {
        document.getElementById('quota-modal').classList.add('hidden');
        purgeLocalUserData(); 
        navigate('signup-screen');
    });

    safeOnclick('nav-signup-btn', () => {
        purgeLocalUserData(); 
        navigate('signup-screen');
    });

    safeOnclick('switch-to-login', (e) => { e.preventDefault(); navigate('auth-screen'); });
    safeOnclick('back-to-auth', () => navigate('auth-screen'));
    safeOnclick('back-to-chat', () => navigate('chat-screen'));
    safeOnclick('do-logout-btn', handleLogout);
    safeOnclick('dropdown-logout-btn', handleLogout);
    safeOnclick('nav-subscription-btn', () => navigate('subscription-screen'));
    safeOnclick('back-to-profile', () => navigate('profile-screen'));
    
    safeOnclick('modal-upgrade-btn', () => {
        document.getElementById('quota-modal').classList.add('hidden');
        navigate('subscription-screen');
    });
    safeOnclick('close-modal-btn', () => document.getElementById('quota-modal').classList.add('hidden'));

    document.querySelectorAll('.toggle-pass').forEach(icon => {
        icon.onclick = function() {
            const inputField = document.getElementById(this.getAttribute('data-target'));
            if (inputField?.type === 'password') inputField.type = 'text';
            else if (inputField) inputField.type = 'password';
        };
    });
}

function safeOnclick(id, callback) {
    const el = document.getElementById(id);
    if (el) el.onclick = callback;
}

// ==========================================
// 7. SUPABASE AUTH INTEGRATION
// ==========================================
const SUPABASE_URL = 'https://wlhfdibahaeeoxagaach.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_yskxtUsaXuCClaCxpeHNvw_7EwuWycW'; 

let supabaseClient = null;

setTimeout(() => {
    if (typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        bindProdNavigation();

        safeOnclick('nav-guest-btn', () => {
            if (!checkLegalRequirements('legal-agree-login')) return;
            const guestUsage = getGuestUsage();

            profileData = {
                username: "Guest User",
                email: "guest@xyvro.ai",
                tier: "guest",
                messages_sent_today: guestUsage.messages, 
                images_uploaded_today: guestUsage.images
            };

            navigate('chat-screen');
            updateProfileUI();
            loadHistory(); 
        });

        safeOnclick('google-login-btn', async () => {
            if (!checkLegalRequirements('legal-agree-login')) return;
            await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
        });

        safeOnclick('do-signup-btn', async () => {
            if (!checkLegalRequirements('legal-agree-signup')) return;
            const name = document.getElementById('signup-name').value.trim();
            const email = document.getElementById('signup-email').value.trim();
            const pass = document.getElementById('signup-pass').value.trim();
            if (!name || !email || !pass) return alert("Please fill in all fields.");

            const { error } = await supabaseClient.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
            if (error) alert(error.message);
            else { alert("Verification link dispatched."); navigate('auth-screen'); }
        });

        safeOnclick('do-login-btn', async () => {
            if (!checkLegalRequirements('legal-agree-login')) return;
            const email = document.getElementById('login-email').value.trim();
            const pass = document.getElementById('login-pass').value.trim();
            if (!email || !pass) return alert("Please fill credentials.");

            const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
            if (error) alert(error.message);
        });

        supabaseClient.auth.getSession().then(handlePostLoginFlow);
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) handlePostLoginFlow({ data: { session } });
        });
    }
}, 500);

async function handlePostLoginFlow({ data: { session } }) {
    if (session) {
        currentSession = session;
        const user = session.user;
        let { data, error } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();

        if (error || !data) {
            const fallback = { id: user.id, username: user.raw_user_metadata?.full_name || user.email.split('@')[0], email: user.email, tier: 'normal', messages_sent_today: 0, images_uploaded_today: 0 };
            await supabaseClient.from('profiles').insert([fallback]);
            profileData = fallback;
        } else {
            profileData = data;
        }

        if (profileData.tier === 'subscribed' && profileData.subscription_expires_at) {
            if (new Date() > new Date(profileData.subscription_expires_at)) {
                profileData.tier = 'normal';
                await supabaseClient.from('profiles').update({ tier: 'normal' }).eq('id', user.id);
                alert("Your 28-day Pro subscription has expired. Reverted to Free.");
            }
        }

        navigate('chat-screen');
        updateProfileUI();
        applyAvatarToUI(profileData?.avatar_url || user.raw_user_metadata?.avatar_url);
        loadHistory();
    }
}

async function handleLogout() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    localStorage.removeItem(`xyvro_history_${currentSession?.user.id}`);
    currentSession = null; profileData = null; chatMessages = []; currentBase64Image = null;
    navigate('auth-screen');
}

// ==========================================
// 8. REAL-TIME VALID RESPONSES TELEMETRY 
// ==========================================
async function handleSend() {
    const input = document.getElementById('user-input');
    const promptText = input.value.trim();
    if (!promptText && !currentBase64Image) return;

    const tier = profileData?.tier || 'guest';
    const msgLimit = LIMITS[tier].messages;
    const imgLimit = LIMITS[tier].images;
    const activeDelay = LIMITS[tier].delay;

    if (profileData.messages_sent_today >= msgLimit) {
        if (tier === 'guest') {
            triggerQuotaModal("Account Required", "Guest limits reached (10 messages/day). Sign up now to unlock deeper standard quotas.", "guest");
        } else {
            triggerQuotaModal("Limit Exhausted", "You have exhausted your daily limit. Upgrade to Pro for 500 messages daily.", "normal");
        }
        return;
    }

    if (currentBase64Image && profileData.images_uploaded_today >= imgLimit) {
        if (tier === 'guest') {
            triggerQuotaModal("Vision Disabled", "Guest accounts are locked to 1 image analysis daily. Authenticate to unlock more capabilities.", "guest");
        } else {
            alert(`Limit Exceeded: Standard accounts can parse up to ${imgLimit} visual matrix files daily.`);
        }
        document.getElementById('chat-remove-image-btn').click();
        return;
    }

    const userMsgData = { type: 'user', content: promptText, image: currentBase64Image };
    appendMessageUI(userMsgData);
    if (tier !== 'guest') saveToHistory(userMsgData);

    const imageSentThisTurn = currentBase64Image;
    input.value = '';
    document.getElementById('chat-remove-image-btn').click();

    const thinkingEl = showAiThinking("XyvroAI is parsing...");

    try {
        const payload = { prompt: promptText };
        if (imageSentThisTurn && tier !== 'guest') payload.imageBase64 = imageSentThisTurn;

        const { data, error } = await supabaseClient.functions.invoke('chat', { body: payload });
        if (error) throw error;

        setTimeout(async () => {
            profileData.messages_sent_today += 1;
            if (imageSentThisTurn) profileData.images_uploaded_today += 1;

            if (tier === 'guest') {
                saveGuestUsage(profileData.messages_sent_today, profileData.images_uploaded_today);
            } else {
                await supabaseClient.from('profiles').update({
                    messages_sent_today: profileData.messages_sent_today,
                    images_uploaded_today: profileData.images_uploaded_today
                }).eq('id', currentSession.user.id);
            }

            thinkingEl.remove();
            const aiMsgData = { type: 'ai', content: data.reply || "No generation compiled." };
            appendMessageUI(aiMsgData);
            if (tier !== 'guest') saveToHistory(aiMsgData);

        }, activeDelay);

    } catch (err) {
        console.error("Pipeline failure:", err);
        thinkingEl.textContent = "Pipeline Error. Quota consumption retained.";
        setTimeout(() => thinkingEl.remove(), 4000);
    }
}

const sendBtn = document.getElementById('send-btn');
if (sendBtn) sendBtn.onclick = handleSend;
const userInput = document.getElementById('user-input');
if (userInput) userInput.onkeypress = (e) => { if (e.key === 'Enter') handleSend(); };

// ==========================================
// 9. LIVE TRANSACTION PAYMENT GATEWAY
// ==========================================
const upgradePaymentBtn = document.getElementById('razorpay-pay-btn');

if (upgradePaymentBtn) {
    upgradePaymentBtn.onclick = async function() {
        const tier = profileData?.tier || 'guest';
        
        if (tier === 'guest') {
            alert("Please create a permanent profile before updating subscription attributes.");
            purgeLocalUserData(); 
            navigate('signup-screen');
            return;
        }

        if (tier === 'subscribed') {
            const expStr = profileData.subscription_expires_at ? new Date(profileData.subscription_expires_at).toLocaleDateString() : "active window";
            alert(`Subscription Active: Your account is already configured to Pro. You cannot run a recurring renewal loop until your current 28-day window completes (${expStr}).`);
            return;
        }

        const options = {
            "key": "rzp_live_SwGF2PDmWVkSjC", 
            "amount": "100", 
            "currency": "INR",
            "name": "Xyvro Entertainment",
            "description": "Pro Tier Subscription - 28 Days Lifecycle",
            "image": generateDefaultAvatarUrl("Xyvro"),
            "handler": async function (response) {
                if (response.razorpay_payment_id) {
                    const activatedAt = new Date();
                    const expiresAt = new Date();
                    expiresAt.setDate(activatedAt.getDate() + 28); 

                    const databaseUpdates = {
                        tier: 'subscribed',
                        subscribed_at: activatedAt.toISOString(),
                        subscription_expires_at: expiresAt.toISOString()
                    };

                    const { error } = await supabaseClient
                        .from('profiles')
                        .update(databaseUpdates)
                        .eq('id', currentSession.user.id);

                    if (error) {
                        console.error("Transactional database write error:", error);
                        alert("Database configuration write failure. Reach out directly to support.");
                    } else {
                        Object.assign(profileData, databaseUpdates);
                        alert("Payment Captured! XyvroAI Pro attributes are now mapped to your account profile.");
                        navigate('profile-screen');
                        updateProfileUI();
                    }
                }
            },
            "prefill": {
                "name": profileData?.username || "",
                "email": profileData?.email || ""
            },
            "theme": {
                "color": "#2563eb"
            }
        };

        const razorpayInstance = new window.Razorpay(options);
        razorpayInstance.open();
    };
}
