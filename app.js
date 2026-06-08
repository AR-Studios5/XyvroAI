// ==========================================
// 1. STATE INITIALIZATION & CONFIG MATRIX
// ==========================================
const SUPPORT_EMAIL = 'xyvroentertainment@gmail.com';

// --- DYNAMIC UI INJECTION (Styles for Code Blocks, Sidebar, Context Menu & Animations) ---
const extraStyles = document.createElement('style');
extraStyles.innerHTML = `
/* Code Blocks */
.code-container { background: #0d1117; border-radius: 8px; margin: 12px 0; overflow: hidden; border: 1px solid #30363d; }
.code-header { background: #161b22; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; color: #8b949e; font-size: 12px; font-family: monospace; }
.copy-btn { background: #21262d; border: 1px solid #363b42; color: #c9d1d9; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px; transition: 0.2s; }
.copy-btn:hover { background: #30363d; color: #fff; }
.code-content { padding: 12px; overflow-x: auto; color: #c9d1d9; font-family: monospace; font-size: 14px; margin: 0; line-height: 1.5; }

/* Thinking Animation */
.typing-indicator { display: flex; gap: 4px; padding: 4px 8px; align-items: center; height: 24px;}
.typing-dot { width: 6px; height: 6px; background: #64748b; border-radius: 50%; animation: typing 1.4s infinite ease-in-out both; }
.typing-dot:nth-child(1) { animation-delay: -0.32s; }
.typing-dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes typing { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

/* Chat Sidebar History */
.chat-sidebar { position: fixed; left: -300px; top: 0; width: 280px; height: 100%; background: var(--surface-card); backdrop-filter: blur(24px); border-right: 1px solid var(--border-color); z-index: 1000; transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column; padding: 24px; box-shadow: 5px 0 25px rgba(0,0,0,0.1); }
.chat-sidebar.open { left: 0; }
.sidebar-close { position: absolute; right: 16px; top: 20px; cursor: pointer; color: var(--text-muted); background: none; border:none; display:flex; align-items:center; justify-content:center; padding:4px;}
.sidebar-new-btn { width: 100%; padding: 12px; background: var(--primary-blue); color: white; border: none; border-radius: 8px; margin-bottom: 20px; cursor: pointer; font-weight: 600; display:flex; align-items:center; justify-content:center; gap:8px; transition: 0.2s; }
.sidebar-new-btn:hover { background: var(--primary-hover); }
.chat-history-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
.chat-history-item { padding: 12px; background: var(--surface-white); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-main); font-weight: 500; transition: 0.2s; user-select: none; -webkit-user-select: none;}
.chat-history-item:hover { border-color: var(--primary-blue); }
.chat-history-item.active { border-color: var(--primary-blue); background: rgba(37,99,235,0.05); color: var(--primary-blue);}
#history-toggle-btn { cursor: pointer; background: none; border: none; color: var(--text-main); display:flex; align-items:center; justify-content:center; padding: 8px; margin-right: 12px; }

/* Context Menu (Long Press / Right Click) */
.chat-context-menu { position: fixed; background: var(--surface-card); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 2000; display: none; flex-direction: column; padding: 4px; backdrop-filter: blur(16px); min-width: 140px; }
.context-item { padding: 10px 16px; cursor: pointer; font-size: 14px; border-radius: 4px; transition: 0.2s; color: var(--text-main); font-weight: 500; display: flex; align-items: center; gap: 8px; }
.context-item:hover { background: var(--border-color); }
.context-item.delete-item { color: #ef4444; }
.context-item.delete-item:hover { background: rgba(239,68,68,0.1); }
.context-item svg { width: 16px; height: 16px; }
`;
document.head.appendChild(extraStyles);

// Inject Context Menu HTML safely
const contextMenuHTML = `
<div id="chat-context-menu" class="chat-context-menu">
    <div class="context-item" id="context-rename"><i data-lucide="edit-2"></i> Rename</div>
    <div class="context-item delete-item" id="context-delete"><i data-lucide="trash-2"></i> Delete</div>
</div>`;
document.body.insertAdjacentHTML('beforeend', contextMenuHTML);

const toast = document.getElementById('status-toast');
if (toast) {
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

if (typeof lucide !== 'undefined') lucide.createIcons();

let currentSession = null;
let profileData = null; 
let currentBase64Image = null;
let chatSessions = [];
let currentChatId = null;
let contextTargetChatId = null;

const LIMITS = {
    guest: { messages: 10, images: 1, delay: 3000 },
    normal: { messages: 50, images: 10, delay: 2000 },
    subscribed: { messages: 500, images: 50, delay: 0 }
};

// Bulletproof click binder
function safeOnclick(id, callback) {
    const el = document.getElementById(id);
    if (el) el.onclick = callback;
}

// ==========================================
// 2. PARSING & TYPING ENGINE (AI Formatting)
// ==========================================
function parseMarkdown(text) {
    let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
        return `<div class="code-container"><div class="code-header"><span>${lang || 'code'}</span><button class="copy-btn" onclick="window.copyCodeToClipboard(this)">Copy</button></div><pre class="code-content"><code>${code}</code></pre></div>`;
    });
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

window.copyCodeToClipboard = function(btn) {
    const codeContainer = btn.parentElement.nextElementSibling;
    const code = codeContainer.innerText;
    navigator.clipboard.writeText(code);
    btn.innerText = "Copied!";
    setTimeout(() => btn.innerText = "Copy", 2000);
};

async function typeHtmlEffect(element, htmlString, speed = 12) {
    element.innerHTML = '';
    let i = 0;
    let isTag = false;
    let text = "";
    const container = document.getElementById('chat-container');

    return new Promise(resolve => {
        function type() {
            if (i < htmlString.length) {
                if (htmlString.charAt(i) === '<') isTag = true;
                text += htmlString.charAt(i);
                if (htmlString.charAt(i) === '>') isTag = false;
                
                i++;
                if (isTag) {
                    type(); 
                } else {
                    element.innerHTML = text;
                    if (container) {
                        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
                        if (isNearBottom) {
                            container.scrollTop = container.scrollHeight;
                        }
                    }
                    setTimeout(type, speed);
                }
            } else {
                resolve();
            }
        }
        type();
    });
}

// ==========================================
// 3. CHAT SESSION CONTROLLER (Sidebar History)
// ==========================================
function generateId() { return Math.random().toString(36).substr(2, 9); }

function generateSmartTitle(promptText) {
    if (!promptText) return "New Conversation";
    const stopWords = ['a', 'an', 'the', 'is', 'to', 'how', 'what', 'why', 'can', 'you', 'make', 'write'];
    let words = promptText.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => !stopWords.includes(w.toLowerCase()) && w.length > 0);
    let titleWords = words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1));
    return titleWords.length > 0 ? titleWords.join(' ') : "New Conversation";
}

function injectSidebarUI() {
    if(document.getElementById('chat-sidebar')) return;
    
    const sidebar = document.createElement('div');
    sidebar.id = 'chat-sidebar';
    sidebar.className = 'chat-sidebar';
    sidebar.innerHTML = `
        <button class="sidebar-close" id="close-sidebar-btn"><i data-lucide="x"></i></button>
        <h2 class="brand-title-small" style="margin-bottom: 24px;">Your Chats</h2>
        <button class="sidebar-new-btn" id="sidebar-new-btn"><i data-lucide="plus"></i> New Chat</button>
        <div class="chat-history-list" id="chat-history-list"></div>
    `;
    document.body.appendChild(sidebar);
    
    const chatHeader = document.querySelector('#chat-screen .glass-top');
    if (chatHeader && !document.getElementById('history-toggle-btn')) {
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'history-toggle-btn';
        toggleBtn.className = 'icon-btn';
        toggleBtn.innerHTML = '<i data-lucide="menu"></i>';
        chatHeader.insertBefore(toggleBtn, chatHeader.firstChild);
    }
    
    safeOnclick('history-toggle-btn', () => sidebar.classList.add('open'));
    safeOnclick('close-sidebar-btn', () => sidebar.classList.remove('open'));
    safeOnclick('sidebar-new-btn', () => createNewChat());
    
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function loadChatSessions() {
    if (!currentSession?.user?.id) return;
    const stored = localStorage.getItem(`xyvro_chats_${currentSession.user.id}`);
    
    if (stored) {
        chatSessions = JSON.parse(stored);
    } else {
        const oldHistory = localStorage.getItem(`xyvro_history_${currentSession.user.id}`);
        if (oldHistory) {
            chatSessions = [{ id: generateId(), title: "Legacy Chat", messages: JSON.parse(oldHistory) }];
            localStorage.removeItem(`xyvro_history_${currentSession.user.id}`);
        } else {
            chatSessions = [];
        }
    }
    
    renderSidebar();
    if (chatSessions.length > 0) switchChat(chatSessions[0].id);
    else createNewChat();
}

function createNewChat() {
    currentChatId = generateId();
    chatSessions.unshift({ id: currentChatId, title: "New Conversation", messages: [] });
    saveChats();
    renderSidebar();
    switchChat(currentChatId);
    
    const sidebar = document.getElementById('chat-sidebar');
    if(sidebar && window.innerWidth <= 768) sidebar.classList.remove('open');
}

function saveChats() {
    if (currentSession?.user?.id) {
        localStorage.setItem(`xyvro_chats_${currentSession.user.id}`, JSON.stringify(chatSessions));
    }
}

function saveToHistory(msg) {
    const chat = chatSessions.find(c => c.id === currentChatId);
    if (!chat) return;
    
    const historyMsg = {...msg};
    if (historyMsg.type === 'user' && historyMsg.image) historyMsg.image = '(Image Attached)';
    chat.messages.push(historyMsg);
    
    if (chat.messages.length === 1 || (chat.messages.length === 2 && chat.title === "New Conversation")) {
        let text = historyMsg.content || "Image Upload";
        chat.title = generateSmartTitle(text);
        renderSidebar();
    }
    saveChats();
}

function switchChat(id) {
    currentChatId = id;
    renderSidebar(); 
    const chat = chatSessions.find(c => c.id === id);
    
    const container = document.getElementById('chat-container');
    if (!container) return;

    container.innerHTML = '';
    
    if (chat && chat.messages) {
        chat.messages.forEach(msg => appendMessageUI(msg, false, false));
        container.scrollTop = container.scrollHeight;
    }
    
    if (chat && chat.messages.length === 0) {
        initChatGreeting();
    }
}

// --- CONTEXT MENU LOGIC ---
function renderSidebar() {
    const list = document.getElementById('chat-history-list');
    if(!list) return;
    list.innerHTML = '';
    
    chatSessions.forEach(chat => {
        const item = document.createElement('div');
        item.className = `chat-history-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.textContent = chat.title || "Conversation";
        
        item.onclick = () => {
            switchChat(chat.id);
            const sidebar = document.getElementById('chat-sidebar');
            if(sidebar && window.innerWidth <= 768) sidebar.classList.remove('open');
        };

        // Long Press Logic (Mobile)
        let pressTimer;
        item.ontouchstart = (e) => {
            pressTimer = setTimeout(() => {
                showContextMenu(e.touches[0].clientX, e.touches[0].clientY, chat.id);
            }, 600); 
        };
        item.ontouchend = () => clearTimeout(pressTimer);
        item.ontouchmove = () => clearTimeout(pressTimer);

        // Right Click Logic (Desktop)
        item.oncontextmenu = (e) => {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY, chat.id);
        };

        list.appendChild(item);
    });
}

function showContextMenu(x, y, chatId) {
    contextTargetChatId = chatId;
    const menu = document.getElementById('chat-context-menu');
    if (menu) {
        menu.style.display = 'flex';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }
}

// Hide Context Menu globally
document.addEventListener('click', (e) => {
    const menu = document.getElementById('chat-context-menu');
    if (menu && e.target !== menu && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
});

safeOnclick('context-rename', () => {
    const menu = document.getElementById('chat-context-menu');
    if(menu) menu.style.display = 'none';
    
    const chat = chatSessions.find(c => c.id === contextTargetChatId);
    if(chat) {
        const newTitle = prompt("Enter a new name for this chat:", chat.title);
        if(newTitle && newTitle.trim() !== "") {
            chat.title = newTitle.trim();
            saveChats();
            renderSidebar();
        }
    }
});

safeOnclick('context-delete', () => {
    const menu = document.getElementById('chat-context-menu');
    if(menu) menu.style.display = 'none';
    
    if(confirm("Are you sure you want to delete this chat?")) {
        chatSessions = chatSessions.filter(c => c.id !== contextTargetChatId);
        saveChats();
        
        if (chatSessions.length === 0) {
            createNewChat();
        } else if (currentChatId === contextTargetChatId) {
            switchChat(chatSessions[0].id);
        } else {
            renderSidebar();
        }
    }
});

function purgeLocalUserData() {
    console.log("Purging tracking registers and resetting memory variables...");
    localStorage.removeItem('xyvro_guest_session');
    if (currentSession?.user?.id) {
        localStorage.removeItem(`xyvro_chats_${currentSession.user.id}`);
    }
    chatSessions = [];
    currentBase64Image = null;
    profileData = null;
    const container = document.getElementById('chat-container');
    if (container) container.innerHTML = '';
}

// ==========================================
// 4. METADATA PROFILE ENGINE & UI UPDATES
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

function navigate(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const dropdown = document.getElementById('settings-dropdown');
    if(dropdown) dropdown.classList.add('hidden'); 
    
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

function generateDefaultAvatarUrl(name) {
    const safeName = name || "X";
    const initial = safeName.charAt(0).toUpperCase();
    return `https://api.dicebear.com/8.x/initials/svg?seed=${initial}&radius=50&backgroundColor=2563eb`;
}

function applyAvatarToUI(imgUrl) {
    const finalUrl = imgUrl || generateDefaultAvatarUrl(profileData?.username);
    ['profile-trigger', 'profile-avatar-image'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.src = finalUrl;
    });
}

function updateProfileUI() {
    if (!profileData) return;
    const name = profileData.username || "User Account";
    const email = profileData.email || "No Email Provided";
    const tier = profileData.tier || 'guest';

    applyAvatarToUI(profileData.avatar_url);
    
    const nameDisplay = document.getElementById('profile-name-display');
    const emailDisplay = document.getElementById('profile-email-display');
    if(nameDisplay) nameDisplay.textContent = name;
    if(emailDisplay) emailDisplay.textContent = email;
    
    const tierBadge = document.getElementById('profile-tier-badge');
    const expiryNote = document.getElementById('sub-expiry-note');
    
    if(tierBadge) {
        tierBadge.textContent = `XyvroAI ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
        if (tier === 'subscribed') {
            tierBadge.style.backgroundColor = '#10b981'; 
            tierBadge.style.color = '#fff';
            if (expiryNote) {
                if (profileData.subscription_expires_at) {
                    const expDate = new Date(profileData.subscription_expires_at).toLocaleDateString();
                    expiryNote.textContent = `Valid until: ${expDate}`;
                } else {
                    expiryNote.textContent = 'Pro Plan Active';
                }
            }
        } else {
            tierBadge.style.backgroundColor = ''; 
            tierBadge.style.color = '';
            if (expiryNote) expiryNote.textContent = 'Free Tier Account';
        }
    }
}

function initChatGreeting() {
    const container = document.getElementById('chat-container');
    if (!container || container.children.length > 0) return; 
    
    const name = profileData?.username?.split(' ')[0] || "Explorer";
    const msgData = { type: 'ai', content: `Hello ${name}. Welcome to XyvroAI. How can I assist you today?` };
    appendMessageUI(msgData, true, false);
    if (profileData?.tier !== 'guest') saveToHistory(msgData);
}

function showAiThinking() {
    const container = document.getElementById('chat-container');
    const msgData = { type: 'ai', isThinking: true };
    const el = appendMessageUI(msgData);
    if(container) container.scrollTop = container.scrollHeight;
    return el; 
}

function appendMessageUI(msg, animate = true, useTypingEffect = false) {
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
    
    const textDiv = document.createElement('div');
    textDiv.className = 'msg-content';
    msgDiv.appendChild(textDiv);
    
    if (msg.isThinking) {
        textDiv.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
    } else if (msg.type === 'ai' && msg.content) {
        const parsedHtml = parseMarkdown(msg.content);
        if (useTypingEffect) {
            typeHtmlEffect(textDiv, parsedHtml);
        } else {
            textDiv.innerHTML = parsedHtml;
        }
    } else if (msg.content) {
        textDiv.textContent = msg.content;
    }

    container.appendChild(msgDiv);
    if (animate && !useTypingEffect) container.scrollTop = container.scrollHeight;
    return msgDiv;
}

function triggerQuotaModal(title, message, displayMode) {
    const dropdown = document.getElementById('settings-dropdown');
    if(dropdown) dropdown.classList.add('hidden');
    
    const titleEl = document.getElementById('modal-title');
    const descEl = document.getElementById('modal-desc');
    if(titleEl) titleEl.textContent = title;
    if(descEl) descEl.textContent = message;
    
    const signUpBtn = document.getElementById('modal-signup-btn');
    const upgradeBtn = document.getElementById('modal-upgrade-btn');
    
    if (displayMode === 'guest') {
        if(signUpBtn) signUpBtn.classList.remove('hidden');
        if(upgradeBtn) upgradeBtn.classList.add('hidden');
    } else {
        if(signUpBtn) signUpBtn.classList.add('hidden');
        if(upgradeBtn) upgradeBtn.classList.remove('hidden');
    }
    
    const modal = document.getElementById('quota-modal');
    if(modal) modal.classList.remove('hidden');
}

// ==========================================
// 5. ATTACHMENT & UI EVENT HUB
// ==========================================
safeOnclick('chat-attach-btn', () => {
    const upload = document.getElementById('chat-file-upload');
    if (upload) upload.click();
});

const chatFileUpload = document.getElementById('chat-file-upload');
if (chatFileUpload) {
    chatFileUpload.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) return alert('Please upload an image file.');
            if (file.size > 5000000) return alert('Image too large. Keep it under 5MB.');

            const reader = new FileReader();
            reader.onload = function(event) {
                currentBase64Image = event.target.result;
                const preview = document.getElementById('chat-image-preview');
                const container = document.getElementById('chat-image-preview-container');
                if(preview) preview.src = currentBase64Image;
                if(container) container.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    };
}

safeOnclick('chat-remove-image-btn', () => {
    currentBase64Image = null;
    const preview = document.getElementById('chat-image-preview');
    const container = document.getElementById('chat-image-preview-container');
    const upload = document.getElementById('chat-file-upload');
    if(preview) preview.src = '';
    if(container) container.classList.add('hidden');
    if(upload) upload.value = '';
});

safeOnclick('profile-trigger', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('settings-dropdown');
    if(dropdown) dropdown.classList.toggle('hidden');
});

window.onclick = (e) => {
    const dropdown = document.getElementById('settings-dropdown');
    if (dropdown && !dropdown.contains(e.target) && e.target.id !== 'profile-trigger') {
        dropdown.classList.add('hidden');
    }
};

safeOnclick('view-profile-btn', (e) => { e.preventDefault(); navigate('profile-screen'); });

safeOnclick('clear-history-btn', (e) => {
    e.preventDefault();
    if (confirm("Are you sure you want to clear ALL your chat histories permanently?")) {
        localStorage.removeItem(`xyvro_chats_${currentSession?.user.id}`);
        chatSessions = [];
        renderSidebar();
        createNewChat();
        alert("All histories erased.");
    }
});

const themeSwitch = document.getElementById('theme-switch');
if (themeSwitch) {
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
}

safeOnclick('edit-name-btn', () => {
    const nameDisplay = document.getElementById('profile-name-display');
    const editBtn = document.getElementById('edit-name-btn');
    const nameInputGroup = document.getElementById('name-input-group');
    const nameInput = document.getElementById('profile-name-input');
    
    if(nameDisplay) nameDisplay.classList.add('hidden');
    if(editBtn) editBtn.classList.add('hidden');
    if(nameInputGroup) nameInputGroup.classList.remove('hidden');
    if(nameInput && nameDisplay) {
        nameInput.value = nameDisplay.textContent;
        nameInput.focus();
    }
});

safeOnclick('save-name-btn', async () => {
    const nameInput = document.getElementById('profile-name-input');
    if(!nameInput) return;
    
    const newName = nameInput.value.trim();
    if (!newName) return alert("Name cannot be blank.");
    
    const nameDisplay = document.getElementById('profile-name-display');
    const editBtn = document.getElementById('edit-name-btn');
    const nameInputGroup = document.getElementById('name-input-group');
    
    if(nameDisplay) nameDisplay.classList.remove('hidden');
    if(editBtn) editBtn.classList.remove('hidden');
    if(nameInputGroup) nameInputGroup.classList.add('hidden');
    
    if (newName === profileData?.username) return;

    if(nameDisplay) nameDisplay.textContent = newName;
    profileData.username = newName;
    applyAvatarToUI(profileData.avatar_url);

    if (typeof supabaseClient !== 'undefined' && currentSession) {
        await supabaseClient.auth.updateUser({ data: { full_name: newName } });
        supabaseClient.from('profiles').update({ username: newName }).eq('id', currentSession.user.id);
    }
});

safeOnclick('change-avatar-btn', () => {
    const upload = document.getElementById('avatar-upload');
    if(upload) upload.click();
});

const avatarUpload = document.getElementById('avatar-upload');
if (avatarUpload) {
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
}

function bindProdNavigation() {
    safeOnclick('modal-signup-btn', () => {
        const modal = document.getElementById('quota-modal');
        if(modal) modal.classList.add('hidden');
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
        const modal = document.getElementById('quota-modal');
        if(modal) modal.classList.add('hidden');
        navigate('subscription-screen');
    });
    safeOnclick('close-modal-btn', () => {
        const modal = document.getElementById('quota-modal');
        if(modal) modal.classList.add('hidden');
    });

    document.querySelectorAll('.toggle-pass').forEach(icon => {
        icon.onclick = function() {
            const inputField = document.getElementById(this.getAttribute('data-target'));
            if (inputField?.type === 'password') inputField.type = 'text';
            else if (inputField) inputField.type = 'password';
        };
    });
}

// ==========================================
// 7. SUPABASE AUTH INTEGRATION (Bulletproof Init)
// ==========================================
const SUPABASE_URL = 'https://wlhfdibahaeeoxagaach.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_yskxtUsaXuCClaCxpeHNvw_7EwuWycW'; 

let supabaseClient = null;

function initAppCore() {
    // Polling loop: If network is slow, it will wait for Supabase instead of crashing
    if (typeof supabase === 'undefined') {
        setTimeout(initAppCore, 200);
        return;
    }
    
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
        
        currentSession = { user: { id: 'guest_local_id' }}; 
        injectSidebarUI();
        loadChatSessions(); 
    });

    safeOnclick('google-login-btn', async () => {
        if (!checkLegalRequirements('legal-agree-login')) return;
        await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    });

    safeOnclick('do-signup-btn', async () => {
        if (!checkLegalRequirements('legal-agree-signup')) return;
        
        const nameEl = document.getElementById('signup-name');
        const emailEl = document.getElementById('signup-email');
        const passEl = document.getElementById('signup-pass');
        
        if(!nameEl || !emailEl || !passEl) return;
        
        const name = nameEl.value.trim();
        const email = emailEl.value.trim();
        const pass = passEl.value.trim();
        
        if (!name || !email || !pass) return alert("Please fill in all fields.");

        const { data, error } = await supabaseClient.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
        
        if (error) {
            alert(error.message);
        } else {
            if (data?.session) {
                alert("Account created successfully!");
                handlePostLoginFlow({ data: { session: data.session } });
            } else {
                alert("Verification link dispatched. Please check your email."); 
                navigate('auth-screen'); 
            }
        }
    });

    safeOnclick('do-login-btn', async () => {
        if (!checkLegalRequirements('legal-agree-login')) return;
        
        const emailEl = document.getElementById('login-email');
        const passEl = document.getElementById('login-pass');
        
        if(!emailEl || !passEl) return;
        
        const email = emailEl.value.trim();
        const pass = passEl.value.trim();
        if (!email || !pass) return alert("Please fill credentials.");

        const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
        if (error) alert(error.message);
    });

    supabaseClient.auth.getSession().then(handlePostLoginFlow);
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) handlePostLoginFlow({ data: { session } });
    });
}

// Start Initialization
initAppCore();

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
            
            if (!profileData.username) {
                profileData.username = user.raw_user_metadata?.full_name || user.email.split('@')[0] || "User";
                supabaseClient.from('profiles').update({ username: profileData.username }).eq('id', user.id);
            }
        }

        if (!profileData.tier || profileData.tier === 'guest' || profileData.tier === 'free') {
            profileData.tier = 'normal';
            await supabaseClient.from('profiles').update({ tier: 'normal' }).eq('id', user.id);
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
        
        injectSidebarUI();
        loadChatSessions();
    }
}

async function handleLogout() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    purgeLocalUserData();
    navigate('auth-screen');
}

// ==========================================
// 8. REAL-TIME VALID RESPONSES TELEMETRY 
// ==========================================
async function handleSend() {
    const input = document.getElementById('user-input');
    if(!input) return;
    
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
        const rmBtn = document.getElementById('chat-remove-image-btn');
        if(rmBtn) rmBtn.click();
        return;
    }

    const userMsgData = { type: 'user', content: promptText, image: currentBase64Image };
    appendMessageUI(userMsgData, true, false);
    if (tier !== 'guest') saveToHistory(userMsgData);

    const imageSentThisTurn = currentBase64Image;
    input.value = '';
    
    const rmBtn = document.getElementById('chat-remove-image-btn');
    if(rmBtn) rmBtn.click();

    const thinkingEl = showAiThinking();

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

            if(thinkingEl) thinkingEl.remove();
            const aiMsgData = { type: 'ai', content: data.reply || "No generation compiled." };
            
            appendMessageUI(aiMsgData, true, true);
            
            if (tier !== 'guest') saveToHistory(aiMsgData);

        }, activeDelay);

    } catch (err) {
        console.error("Pipeline failure:", err);
        if(thinkingEl) {
            thinkingEl.innerHTML = '<div class="msg-content">Pipeline Error. Quota consumption retained.</div>';
            setTimeout(() => thinkingEl.remove(), 4000);
        }
    }
}

safeOnclick('send-btn', handleSend);

const userInputField = document.getElementById('user-input');
if (userInputField) {
    userInputField.onkeypress = (e) => { if (e.key === 'Enter') handleSend(); };
}

// ==========================================
// 9. LIVE TRANSACTION PAYMENT GATEWAY
// ==========================================
safeOnclick('razorpay-pay-btn', async function() {
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
        "amount": "19900", // 19900 paise = exactly ₹199 INR
        "currency": "INR",
        "name": "Xyvro Entertainment",
        "description": "Pro Tier Subscription - 28 Days Lifecycle",
        "image": generateDefaultAvatarUrl("Xyvro"),
        "handler": async (response) => {
            try {
                if (response.razorpay_payment_id) {
                    const activatedAt = new Date();
                    const expiresAt = new Date();
                    expiresAt.setDate(activatedAt.getDate() + 28); 

                    const databaseUpdates = {
                        tier: 'subscribed',
                        subscribed_at: activatedAt.toISOString(),
                        subscription_expires_at: expiresAt.toISOString()
                    };

                    const { data, error } = await supabaseClient
                        .from('profiles')
                        .update(databaseUpdates)
                        .eq('id', currentSession.user.id)
                        .select(); 

                    if (error) {
                        console.error("Supabase Write Error:", error);
                        alert("Database error: " + error.message + "\n\n(Make sure you added the 'subscription_expires_at' column in Supabase!)");
                    } else if (!data || data.length === 0) {
                        alert("Payment succeeded, but Supabase blocked the update. Check your RLS policies in the database.");
                    } else {
                        Object.assign(profileData, databaseUpdates);
                        alert("Payment Captured! XyvroAI Pro attributes are now mapped to your account profile.");
                        navigate('profile-screen');
                        updateProfileUI();
                    }
                }
            } catch (err) {
                alert("Unexpected pipeline error during payment confirmation: " + err.message);
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

    if (window.Razorpay) {
        const razorpayInstance = new window.Razorpay(options);
        razorpayInstance.open();
    } else {
        alert("Payment gateway failed to load. Please check your connection.");
    }
});
