// ==========================================
// 1. CONFIG & SYSTEM DIAGNOSTIC
// ==========================================
const SUPPORT_EMAIL = 'xyvroentertainment@gmail.com';
const DB_REFRESH_RATE = 300000; // 5 mins (standard for Google servers to pick up OAuth changes)

const toast = document.getElementById('status-toast');
if (toast) {
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

if (typeof lucide !== 'undefined') lucide.createIcons();

// --- Local State ---
let currentSession = null;
let profileData = null; // Stored user profile (metadata + db quotas)
let chatMessages = []; // Local history
let currentBase64Image = null;


// ==========================================
// 2. CORE UTILITIES
// ==========================================

function navigate(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('settings-dropdown').classList.add('hidden'); // Close settings
    const target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');
}

// Check PP checkbox before auth
function checkLegalRequirements(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox || !checkbox.checked) {
        alert("You must agree to the T&C and Payment Policy to proceed.");
        return false;
    }
    return true;
}

// Generate Default Avatar based on first initial
function generateDefaultAvatarUrl(name = "X") {
    const initial = name.charAt(0).toUpperCase();
    return `https://api.dicebear.com/8.x/initials/svg?seed=${initial}&radius=50&backgroundColor=2563eb`;
}

// Apply Avatar to all UI triggers
function applyAvatarToUI(imgUrl) {
    const finalUrl = imgUrl || generateDefaultAvatarUrl(profileData?.username);
    const triggers = ['profile-trigger', 'profile-avatar-image'];
    triggers.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.src = finalUrl;
            el.alt = (profileData?.username || "U").charAt(0).toUpperCase();
        }
    });
}

// Save message to local history (without image base64, too bulky)
function saveToHistory(msg) {
    const historyMsg = {...msg};
    if (historyMsg.type === 'user' && historyMsg.image) {
        historyMsg.image = '(Image Attached)'; // Simplified for local storage
    }
    chatMessages.push(historyMsg);
    localStorage.setItem(`xyvro_history_${currentSession?.user.id}`, JSON.stringify(chatMessages));
}

// Load local history
function loadHistory() {
    chatMessages = JSON.parse(localStorage.getItem(`xyvro_history_${currentSession?.user.id}`)) || [];
    const container = document.getElementById('chat-container');
    container.innerHTML = ''; // Clear Thinking indicators
    chatMessages.forEach(msg => appendMessageUI(msg, false)); // No animation/saving on load
    initChatGreeting(false); // Greeting *after* history, no save.
}


// ==========================================
// 3. UI INITIALIZATION & PERSONALIZATION
// ==========================================

function updateProfileUI() {
    const user = currentSession.user;
    const name = profileData?.username || user.raw_user_metadata?.full_name || user.email.split('@')[0];
    const email = user.email;
    const avatarUrl = profileData?.avatar_url || user.raw_user_metadata?.avatar_url;
    const tier = profileData?.tier || 'guest';

    // Populate Account Page
    applyAvatarToUI(avatarUrl);
    document.getElementById('profile-name-display').textContent = name;
    document.getElementById('profile-email-display').textContent = email;
    
    // Tier Badge & Upgrade Button
    const tierBadge = document.getElementById('profile-tier-badge');
    const upgradeBtn = document.getElementById('razorpay-upgrade-btn');
    tierBadge.textContent = `XyvroAI ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
    
    if (tier === 'subscribed') {
        tierBadge.style.backgroundColor = '#10b981'; // Green
        tierBadge.style.color = '#fff';
        upgradeBtn.textContent = 'Manage Subscription';
        upgradeBtn.style.backgroundColor = '#64748b'; // Muted
    } else {
        tierBadge.style.backgroundColor = ''; // Default Blue
        tierBadge.style.color = '';
        upgradeBtn.textContent = 'Upgrade via Razorpay';
        upgradeBtn.style.backgroundColor = '#0f172a'; // Black
    }
}

// Init chat with personalization and Greeting
function initChatGreeting(shouldSave = true) {
    const container = document.getElementById('chat-container');
    if (!container || (container.children.length > 0 && shouldSave)) return; // Greeting already exists
    
    const name = profileData?.username?.split(' ')[0] || currentSession.user.email.split('@')[0]; // First name or email prefix
    
    const msgData = {
        type: 'ai',
        content: `Hello ${name}. Welcome to XyvroAI. How can I assist you today?`
    };
    appendMessageUI(msgData);
    if (shouldSave) saveToHistory(msgData);
}

// Show thinking indicator
function showAiThinking(message = "Analyzing...") {
    const container = document.getElementById('chat-container');
    const msgData = { type: 'ai', content: message, isThinking: true };
    const el = appendMessageUI(msgData);
    container.scrollTop = container.scrollHeight;
    return el; // Return element to update it later
}


// Append message to DOM
function appendMessageUI(msg, animate = true) {
    const container = document.getElementById('chat-container');
    if (!container) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${msg.type === 'ai' ? 'ai-message' : 'user-message'}`;
    if (msg.isThinking) msgDiv.id = 'ai-thinking-indicator';

    if (msg.image) {
        const imgEl = document.createElement('img');
        imgEl.src = msg.image;
        imgEl.alt = 'User upload';
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


// ==========================================
// 4. LIMITS & QUOTA POPUPS
// ==========================================

const MSG_LIMITS = { guest: 10, normal: 50, subscribed: 500 };
const IMG_LIMITS = { guest: 1, normal: 50, subscribed: 500 }; // Intentionally 1 for guest
const AI_DELAY = { guest: 3000, normal: 2000, subscribed: 0 }; // Artificial delays

// Show quota exhausted popup
function showQuotaModal() {
    document.getElementById('settings-dropdown').classList.add('hidden'); // Close dropdown if open
    document.getElementById('quota-modal').classList.remove('hidden');
}


// ==========================================
// 5. IMAGE UPLOAD HANDLING (BASE64)
// ==========================================

// --- MAIN CHAT FOOTER ATTACHMENT ---
const chatAttachBtn = document.getElementById('chat-attach-btn');
const chatFileUpload = document.getElementById('chat-file-upload');
const chatPreviewContainer = document.getElementById('chat-image-preview-container');
const chatImagePreview = document.getElementById('chat-image-preview');
const chatRemoveImageBtn = document.getElementById('chat-remove-image-btn');

chatAttachBtn.onclick = () => chatFileUpload.click();

chatFileUpload.onchange = function(e) {
    const file = e.target.files[0];
    if (file) {
        // Strict file type check
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
// 6. ACCOUNT SETTINGS LOGIC
// ==========================================

// --- DROPDOWN VISIBILITY ---
document.getElementById('profile-trigger').onclick = (e) => {
    e.stopPropagation(); // Prevents instant closing
    document.getElementById('settings-dropdown').classList.toggle('hidden');
};

// Close dropdown if clicking elsewhere
window.onclick = () => {
    document.getElementById('settings-dropdown').classList.add('hidden');
};


// --- VIEW PROFILE ---
document.getElementById('view-profile-btn').onclick = (e) => {
    e.preventDefault();
    navigate('profile-screen');
};

// --- CLEAR HISTORY ---
document.getElementById('clear-history-btn').onclick = (e) => {
    e.preventDefault();
    const userId = currentSession?.user.id;
    if (confirm("Are you sure you want to clear your entire chat history locally?")) {
        localStorage.removeItem(`xyvro_history_${userId}`);
        chatMessages = [];
        loadHistory(); // Reload to initial state
        toast.textContent = "History cleared.";
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 2000);
    }
};


// --- THEME SWITCH (LIGHT/DARK) ---
const themeSwitch = document.getElementById('theme-switch');
// Load preference
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


// --- PROFILE NAME EDIT ---
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

    // Optimization: Only update if changed
    if (newName === profileData?.username) return;

    nameDisplay.textContent = newName;
    profileData.username = newName; // Update local state
    
    applyAvatarToUI(profileData.avatar_url); // Redraw default avatar based on new name
    initChatGreeting(true); // Redraw greeting with new name

    toast.textContent = "Name updated.";
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2000);

    // Backend Sync (Scoped to metadata to minimize DB calls as requested)
    if (typeof supabase !== 'undefined' && currentSession) {
        const { error } = await supabase.auth.updateUser({
            data: { full_name: newName }
        });
        if (error) console.error("Error syncing name to backend metadata:", error);
    }
};


// --- PROFILE AVATAR EDIT (LOCALLY STored BASE64 as requested) ---
const changeAvatarBtn = document.getElementById('change-avatar-btn');
const avatarUpload = document.getElementById('avatar-upload');

changeAvatarBtn.onclick = () => avatarUpload.click();

avatarUpload.onchange = function(e) {
    const file = e.target.files[0];
    if (file) {
        // Strict file type check
        if (!file.type.startsWith('image/')) return alert('Please upload an image file.');
        if (file.size > 2000000) return alert('Image too large. Keep it under 2MB.');

        const reader = new FileReader();
        reader.onload = async function(event) {
            const base64Avatar = event.target.result;
            profileData.avatar_url = base64Avatar; // Update local state
            applyAvatarToUI(base64Avatar); // Redraw all UI avatar points

            toast.textContent = "Avatar updated locally.";
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 2000);

            // Backend Sync (Scoped to metadata only, no Storage bucket used)
            if (typeof supabase !== 'undefined' && currentSession) {
                const { error } = await supabase.auth.updateUser({
                    data: { avatar_url: base64Avatar }
                });
                if (error) console.error("Error syncing avatar to backend metadata:", error);
            }
        };
        reader.readAsDataURL(file);
    }
};
// ==========================================
// 7. NAVIGATION BINDINGS (Production Ready)
// ==========================================

function bindProdNavigation() {
    lucide.createIcons(); // Ensure settings icons exist
    
    // Auth screens
    safeOnclick('nav-signup-btn', () => navigate('signup-screen'));
    safeOnclick('switch-to-login', (e) => { e.preventDefault(); navigate('auth-screen'); });
    safeOnclick('back-to-auth', () => navigate('auth-screen'));
    
    // Account screens
    safeOnclick('back-to-chat', () => navigate('chat-screen'));
    safeOnclick('do-logout-btn', handleLogout);
    safeOnclick('dropdown-logout-btn', handleLogout);

    // Legal Documents
    ['link-pp1', 'link-tc1', 'link-pp2', 'link-pp3', 'link-tc2', 'link-pp4'].forEach(id => {
        safeOnclick(id, (e) => { e.preventDefault(); navigate('legal-screen'); });
    });

    // Password Toggle
    document.querySelectorAll('.toggle-pass').forEach(icon => {
        icon.onclick = function() {
            const inputField = document.getElementById(this.getAttribute('data-target'));
            if (inputField && inputField.type === 'password') {
                inputField.type = 'text';
                this.setAttribute('data-lucide', 'eye-off');
            } else if (inputField) {
                inputField.type = 'password';
                this.setAttribute('data-lucide', 'eye');
            }
            lucide.createIcons();
        };
    });

    // Modal Popup controls
    safeOnclick('modal-signup-btn', () => {
        document.getElementById('quota-modal').classList.add('hidden');
        navigate('signup-screen');
    });
    
    safeOnclick('modal-upgrade-btn', () => {
        // This will eventually link to Razorpay payment flow
        document.getElementById('quota-modal').classList.add('hidden');
        navigate('profile-screen');
        setTimeout(() => alert("Redirecting to Razorpay secure payment gateway..."), 500);
    });

    safeOnclick('close-modal-btn', () => {
        document.getElementById('quota-modal').classList.add('hidden');
    });
}

// Failsafe event binding
function safeOnclick(id, callback) {
    const el = document.getElementById(id);
    if (el) el.onclick = callback;
}


// ==========================================
// 8. SUPABASE AUTH & AI INTEGRATION (Scoped Production Flow)
// ==========================================

// Backend Configuration
const SUPABASE_URL = 'https://wlhfdibahaeeoxagaach.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_yskxtUsaXuCClaCxpeHNvw_7EwuWycW'; // Provided anon key

let supabaseClient = null;

setTimeout(() => {
    if (typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        bindProdNavigation(); // Ensure icons and basic nav work

        // --- AUTH: Guest Mode ---
        safeOnclick('nav-guest-btn', () => {
            if (!checkLegalRequirements('legal-agree-login')) return;
            // Initialize local profileData for guest state
            profileData = {
                username: "Guest",
                email: "guest@xyvro.ai",
                tier: "guest",
                messages_sent_today: 0, // Tracked only locally for guests
                images_uploaded_today: 0
            };
            navigate('chat-screen');
            updateProfileUI(); // Apply generic avatar/info
            initChatGreeting(); // guest greeting
            // No history saving for guests, scoped local only
        });

        // --- AUTH: Google Login (Dynamically uses window.location.origin) ---
        safeOnclick('google-login-btn', async () => {
            if (!checkLegalRequirements('legal-agree-login')) return;
            const currentWebsite = window.location.origin;
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: currentWebsite }
            });
            if (error) alert("Google Auth Error: " + error.message);
        });

        safeOnclick('google-signup-btn', async () => {
            if (!checkLegalRequirements('legal-agree-signup')) return;
            const currentWebsite = window.location.origin;
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: currentWebsite }
            });
            if (error) alert("Google Auth Error: " + error.message);
        });

        // --- AUTH: Email Signup ---
        safeOnclick('do-signup-btn', async () => {
            if (!checkLegalRequirements('legal-agree-signup')) return;
            
            const name = document.getElementById('signup-name').value.trim();
            const email = document.getElementById('signup-email').value.trim();
            const pass = document.getElementById('signup-pass').value.trim();
            
            if (!name || !email || !pass) return alert("Please fill in all fields.");

            const { error } = await supabaseClient.auth.signUp({
                email: email,
                password: pass,
                options: { data: { full_name: name } } // Saved privately to backend metadata
            });

            if (error) alert("Signup Error: " + error.message);
            else {
                alert("Account created. Please check your email for confirmation.");
                navigate('auth-screen');
            }
        });

        // --- AUTH: Email Login ---
        safeOnclick('do-login-btn', async () => {
            if (!checkLegalRequirements('legal-agree-login')) return;
            const email = document.getElementById('login-email').value.trim();
            const pass = document.getElementById('login-pass').value.trim();
            
            if (!email || !pass) return alert("Please enter email and password.");

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email, password: pass
            });

            if (error) alert("Login Error: " + error.message);
            // Session handling will occur on auto-auth check
        });

        // Auto-login session check on page load
        supabaseClient.auth.getSession().then(handlePostLoginFlow);

        // Listen for Auth state changes the millisecond they happen
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                console.log("Auth event triggered: SIGNED_IN");
                handlePostLoginFlow({ data: { session } });
            }
        });

    }
}, 500); // 500ms for CDN load stability

// --- POST-LOGIN FLOW (Secure DB Quota Fetch) ---
async function handlePostLoginFlow({ data: { session } }) {
    if (session) {
        currentSession = session;
        const user = session.user;
        
        // Fetch extended secure profileData from database (Profiles table in Phase 1 SQL)
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error("Critical: Could not fetch secure quotas from backend:", error);
            // Fallback profile if DB misses
            profileData = { username: user.raw_user_metadata?.full_name, email: user.email, tier: 'normal', messages_sent_today: 0, images_uploaded_today: 0 };
        } else {
            profileData = data; // Set local secure state
        }

        navigate('chat-screen');
        updateProfileUI(); // Populate settings page
        applyAvatarToUI(profileData?.avatar_url || user.raw_user_metadata?.avatar_url); // Populate dropdown triggers
        loadHistory(); // Load personalized local history
    }
}

// Logout handler
async function handleLogout() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    localStorage.removeItem(`xyvro_history_${currentSession?.user.id}`); // clear personalized history
    currentSession = null;
    profileData = null;
    chatMessages = [];
    currentBase64Image = null;
    const inputs = ['login-email', 'login-pass', 'signup-name', 'signup-email', 'signup-pass', 'user-input'];
    inputs.forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    navigate('auth-screen');
}


// ==========================================
// 9. THE SEND LOGIC (Tiered Quotas & Delays)
// ==========================================

async function handleSend() {
    const input = document.getElementById('user-input');
    const promptText = input.value.trim();
    const chatContainer = document.getElementById('chat-container');
    
    if (!promptText && !currentBase64Image) return;

    // --- SECURE QUOTA CHECK (Using backend data) ---
    const tier = profileData?.tier || 'guest';
    const messagesToday = profileData?.messages_sent_today || 0;
    const imagesToday = profileData?.images_uploaded_today || 0;

    if (promptText && messagesToday >= MSG_LIMITS[tier]) {
        return showQuotaModal();
    }
    if (currentBase64Image && imagesToday >= IMG_LIMITS[tier]) {
        // Guests cannot upload images beyond greeting, nor exceed 1 daily.
        if (tier === 'guest') alert("Notice: Guest accounts cannot upload images for AI analysis. Upgrade to Normal or Subscribed to activate this vision feature.");
        else alert("Notice: You have exhausted your daily image quota. Please try again tomorrow.");
        
        document.getElementById('chat-remove-image-btn').click(); // clear
        return;
    }


    // --- BUILD USER MESSAGE ---
    const userMsgData = {
        type: 'user',
        content: promptText,
        image: currentBase64Image, // Full bulky base64 used for direct append
    };
    appendMessageUI(userMsgData);
    if (tier !== 'guest') saveToHistory(userMsgData); // Scoped private history only for normal/subscribed

    // Clear inputs quickly
    input.value = '';
    document.getElementById('chat-remove-image-btn').click(); 
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Show AI Thinking indicator
    const thinkingEl = showAiThinking("XyvroAI is Analyzing...");

    try {
        const payload = { prompt: promptText };
        if (currentBase64Image && tier !== 'guest') {
            payload.imageBase64 = currentBase64Image;
        }

        // Invoke Secure Edge Function (it handles rotation internally)
        const { data, error } = await supabaseClient.functions.invoke('chat', {
            body: payload
        });

        if (error) throw error;
        
        // --- PRO PRODUCTION TIERED DELAY ---
        const finalAiDelay = AI_DELAY[tier];
        // The delay notification has been completely removed to keep it a secret.
        
        setTimeout(async () => {
            // Update secure quotas on backend ONLY if successful privately.
            const updates = { messages_sent_today: messagesToday + 1 };
            if (currentBase64Image && tier !== 'guest') updates.images_uploaded_today = imagesToday + 1;
            
            // Local Guest tracking (no database save required as requested)
            if (tier === 'guest') {
                profileData.messages_sent_today = messagesToday + 1;
                // Guest can't upload images privately anyway, so update ignored privately.
            } else {
                // Backend Database Sync privately to lock in quotas securely
                const { error: quotaError } = await supabaseClient
                    .from('profiles')
                    .update(updates)
                    .eq('id', currentSession.user.id);
                
                if (quotaError) console.error("Error securing backend quotas:", quotaError);
                else {
                    // Update local profileData on success
                    profileData.messages_sent_today = updates.messages_sent_today;
                    if (updates.images_uploaded_today) profileData.images_uploaded_today = updates.images_uploaded_today;
                }
            }

            // Remove indicator and show AI reply
            thinkingEl.remove();
            const aiMsgData = {
                type: 'ai',
                content: data.reply || "No response generated."
            };
            appendMessageUI(aiMsgData);
            if (tier !== 'guest') saveToHistory(aiMsgData); // Save history

        }, finalAiDelay); // The finalAiDelay still runs in the background silently

    } catch (err) {
        // ERROR MESSAGES DO NOT COUNT Private quotas kept safe.
        console.error("Deep Backend Error:", err);
        thinkingEl.textContent = "Error: " + (err.message || JSON.stringify(err));
        setTimeout(() => thinkingEl.remove(), 4000); // clear indicator
    }
}

// Attach Send events
const sendBtn = document.getElementById('send-btn');
if (sendBtn) sendBtn.onclick = handleSend;
const userInput = document.getElementById('user-input');
if (userInput) userInput.onkeypress = (e) => { if (e.key === 'Enter') handleSend(); };
