const SUPABASE_URL = "https://hwgmdwxznxmrgxeqscxo.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_oSxNYee1-1iXvAe_Odsphg_QYqJ0EfM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let userState = {
    userId: null,
    role: 'guest', 
    messagesSentToday: 0
};

let chatSessions = {}; 
let currentChatId = "";

async function initApp() {
    showLoader(); // Fire visual loading screen instantly
    
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('Xyvro_LastDate');
    
    if (savedDate !== today) {
        localStorage.setItem('Xyvro_MsgCount', '0');
        localStorage.setItem('Xyvro_LastDate', today);
        userState.messagesSentToday = 0;
    } else {
        userState.messagesSentToday = parseInt(localStorage.getItem('Xyvro_MsgCount') || '0');
    }

    // Wrap in microtimeout to keep the engine layout threading active during loading
    setTimeout(async () => {
        try {
            chatSessions = JSON.parse(localStorage.getItem('Xyvro_Sessions') || '{}');
        } catch(e) {
            chatSessions = {};
        }

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            userState.userId = session.user.id;
            await syncUserWithDatabase(session.user.id, session.user.email);
        } else {
            userState.role = 'guest';
        }

        updateUIForLimits();
        setupMidnightInterval();

        const chatIds = Object.keys(chatSessions);
        if (chatIds.length > 0) {
            loadChatSession(chatIds[chatIds.length - 1]);
        } else {
            createNewChat();
        }
        
        hideLoader(); // Close loader layout cleanly
    }, 400); 
}

function showLoader() { document.getElementById('storage-loader').style.display = 'flex'; }
function hideLoader() { document.getElementById('storage-loader').style.opacity = '0'; setTimeout(() => { document.getElementById('storage-loader').style.display = 'none'; }, 400); }

function setupMidnightInterval() {
    setInterval(() => {
        const today = new Date().toDateString();
        const savedDate = localStorage.getItem('Xyvro_LastDate');
        if (savedDate !== today) {
            localStorage.setItem('Xyvro_MsgCount', '0');
            localStorage.setItem('Xyvro_LastDate', today);
            userState.messagesSentToday = 0;
            if (userState.userId) {
                supabaseClient.from('user_limits').update({ msg_count: 0, last_reset_date: today }).eq('id', userState.userId);
            }
            updateUIForLimits();
        }
    }, 1000); 
}

async function syncUserWithDatabase(uid, email) {
    const today = new Date().toDateString();
    let { data: profile } = await supabaseClient.from('user_limits').select('*').eq('id', uid).single();

    if (!profile) {
        const { data: newProfile } = await supabaseClient.from('user_limits').insert([
            { id: uid, email: email, role: 'user', msg_count: 0, last_reset_date: today }
        ]).select().single();
        profile = newProfile;
    }

    if (profile.last_reset_date !== today) {
        await supabaseClient.from('user_limits').update({ msg_count: 0, last_reset_date: today }).eq('id', uid);
        userState.messagesSentToday = 0;
    } else {
        userState.messagesSentToday = profile.msg_count;
    }
    
    userState.role = profile.role;
    localStorage.setItem('Xyvro_MsgCount', userState.messagesSentToday.toString());
}

function updateUIForLimits() {
    const limitBadge = document.getElementById('limit-badge');
    const userStatus = document.getElementById('user-status');
    const authBtn = document.getElementById('auth-btn');
    const maxMessages = userState.role === 'guest' ? 10 : (userState.role === 'premium' ? '∞' : 100);
    
    limitBadge.innerText = `Limit: ${userState.messagesSentToday}/${maxMessages}`;
    userStatus.innerText = userState.userId ? `${userState.role.toUpperCase()} Profile` : "Guest Account";
    authBtn.innerText = userState.userId ? "Sign Out" : "Log In / Sign Up";
}

function createNewChat() {
    currentChatId = "chat_" + Date.now();
    chatSessions[currentChatId] = {
        title: "New Chat",
        messages: [
            { sender: 'ai', text: "Hello! Welcome to **XyvroAI**—the premier high-performance text assistant engineered by **Xyvro Entertainment**. \n\n*Product Identity: Version 2.0 Stable*\n*Production Founder & CEO: Aryan Pandey*\n\nHow can I assisting you on your tasks today?" }
        ]
    };
    saveSessionsToLocalStorage();
    renderSidebarHistory();
    loadChatSession(currentChatId);
}

function loadChatSession(id) {
    currentChatId = id;
    const currentChat = chatSessions[currentChatId];
    const chatContainer = document.getElementById('chat-messages');
    chatContainer.innerHTML = '';
    
    currentChat.messages.forEach(msg => {
        appendMessageMarkup(msg.text, msg.sender);
    });
    
    renderSidebarHistory();
}

function deleteChat(id, event) {
    event.stopPropagation(); 
    delete chatSessions[id];
    saveSessionsToLocalStorage();
    
    const remainingIds = Object.keys(chatSessions);
    if (remainingIds.length > 0) {
        loadChatSession(remainingIds[remainingIds.length - 1]);
    } else {
        createNewChat();
    }
}

function saveSessionsToLocalStorage() {
    localStorage.setItem('Xyvro_Sessions', JSON.stringify(chatSessions));
}

function renderSidebarHistory() {
    const listContainer = document.getElementById('chat-history-list');
    listContainer.innerHTML = '';
    
    Object.keys(chatSessions).reverse().forEach(id => {
        const item = chatSessions[id];
        const row = document.createElement('div');
        row.classList.add('history-item');
        if (id === currentChatId) row.classList.add('active');
        row.setAttribute('onclick', `loadChatSession('${id}')`);
        
        row.innerHTML = `
            <span>${item.title}</span>
            <button class="delete-chat-btn" onclick="deleteChat('${id}', event)">✕</button>
        `;
        listContainer.appendChild(row);
    });
}

function generateCleanChatName(prompt) {
    const clean = prompt.replace(/[^\w\s]/gi, '').trim();
    const words = clean.split(/\s+/);
    if (words.length === 0 || words[0] === "") return "Empty Chat";
    
    const sliceCount = Math.min(words.length, 3);
    let titleResult = [];
    for (let i = 0; i < sliceCount; i++) {
        titleResult.push(words[i].charAt(0).toUpperCase() + words[i].slice(1).toLowerCase());
    }
    return titleResult.join(' ');
}

async function sendMessage() {
    const inputField = document.getElementById('user-input');
    const prompt = inputField.value.trim();
    if (!prompt) return;

    const maxMessages = userState.role === 'guest' ? 10 : (userState.role === 'premium' ? Infinity : 100);
    
    if (userState.messagesSentToday >= maxMessages) {
        showLimitModal();
        return;
    }

    if (chatSessions[currentChatId].title === "New Chat") {
        chatSessions[currentChatId].title = generateCleanChatName(prompt);
    }

    chatSessions[currentChatId].messages.push({ sender: 'user', text: prompt });
    appendMessageMarkup(prompt, 'user');
    inputField.value = '';
    autoGrow(inputField);

    appendMessageMarkup("Thinking...", "ai loading-msg");
    const result = await callEdgeAI(prompt);
    removeLoadingMessage();
    
    appendMessageMarkup(result.reply, 'ai');
    chatSessions[currentChatId].messages.push({ sender: 'ai', text: result.reply });
    saveSessionsToLocalStorage();
    renderSidebarHistory();

    if (result.success) {
        userState.messagesSentToday++;
        localStorage.setItem('Xyvro_MsgCount', userState.messagesSentToday.toString());
        
        if (userState.userId) {
            await supabaseClient.from('user_limits').update({ msg_count: userState.messagesSentToday }).eq('id', userState.userId);
        }
        updateUIForLimits();
    }
}

async function callEdgeAI(prompt) {
    try {
        const response = await fetch("https://hwgmdwxznxmrgxeqscxo.supabase.co/functions/v1/xyvro-chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ prompt: prompt })
        });

        const data = await response.json();

        if (response.ok && data && data.reply) {
            return { success: true, reply: data.reply };
        } else if (data && data.error) {
            return { success: false, reply: `Vault Error: ${data.error}` };
        }
        return { success: false, reply: "Polite Notice: Received empty processing stream." };
    } catch (err) {
        console.error(err);
        return { success: false, reply: "Notice: Handshake Failed. Connection interrupted." };
    }
}

function compileSyntaxHighlighting(codeText, lang) {
    let output = codeText;
    output = output.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    output = output.replace(/\b(function|return|if|else|let|const|var|class|export|import|from|async|await|true|false|null)\b/g, '<span class="syntax-keyword">$1</span>');
    output = output.replace(/\b(\d+)\b/g, '<span class="syntax-number">$1</span>');
    output = output.replace(/(["'])(.*?)\1/g, '<span class="syntax-string">$1$2$1</span>');
    output = output.replace(/\b(\w+)(?=\()/g, '<span class="syntax-function">$1</span>');
    output = output.replace(/(\/\/.*)/g, '<span class="syntax-comment">$1</span>');
    return output;
}

function parseMarkdownToCompiler(text) {
    let segments = text.split(/```/);
    let outputHtml = "";

    for (let i = 0; i < segments.length; i++) {
        if (i % 2 === 1) { 
            let blockData = segments[i];
            let firstLineBreak = blockData.indexOf('\n');
            let inferredLanguage = blockData.substring(0, firstLineBreak).trim() || "CODE";
            let trueCodeBody = blockData.substring(firstLineBreak + 1).trim();
            let targetId = "compiler_uid_" + Math.floor(Math.random() * 1000000);
            
            outputHtml += `
                <div class="code-block-container">
                    <div class="code-header">
                        <span class="code-lang">${inferredLanguage}</span>
                        <button class="copy-code-btn" onclick="copyCompilerBlock('${targetId}', this)">Copy Code</button>
                    </div>
                    <pre><code id="${targetId}">${compileSyntaxHighlighting(trueCodeBody, inferredLanguage)}</code></pre>
                </div>
            `;
        } else {
            let bodyText = segments[i];
            bodyText = bodyText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            // Highlight bold markdown blocks **text**
            bodyText = bodyText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            bodyText = bodyText.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
            outputHtml += bodyText.replace(/\n/g, "<br>");
        }
    }
    return outputHtml;
}

function appendMessageMarkup(text, sender) {
    const chatContainer = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender.split(' ')[0]);
    if(sender.includes('loading-msg')) msgDiv.classList.add('loading-msg');
    
    const initial = sender.includes('user') ? 'U' : 'X';
    msgDiv.innerHTML = `<div class="avatar">${initial}</div><div class="bubble"></div>`;
    
    if (sender.includes('ai') && !sender.includes('loading-msg')) {
        msgDiv.querySelector('.bubble').innerHTML = parseMarkdownToCompiler(text);
    } else {
        msgDiv.querySelector('.bubble').textContent = text; 
    }
    
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function copyCompilerBlock(elementId, actionButton) {
    const targetElement = document.getElementById(elementId);
    if (!targetElement) return;
    navigator.clipboard.writeText(targetElement.innerText).then(() => {
        actionButton.innerText = "Copied!";
        setTimeout(() => { actionButton.innerText = "Copy Code"; }, 2000);
    });
}

function removeLoadingMessage() {
    const loadingMsg = document.querySelector('.loading-msg');
    if (loadingMsg) loadingMsg.remove();
}

async function handleAuth(type) {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    if (!email || !password) return alert("Please fill up all input fields.");

    if (type === 'signup') {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) return alert(error.message);
        alert("Registration processed!");
        
        const { data: logData, error: logErr } = await supabaseClient.auth.signInWithPassword({ email, password });
        if(logErr) return window.location.reload();
        
        userState.userId = logData.user.id;
        await syncUserWithDatabase(logData.user.id, logData.user.email);
        updateUIForLimits();
        closeModal('auth-modal');
    } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) return alert(error.message);
        userState.userId = data.user.id;
        await syncUserWithDatabase(data.user.id, data.user.email);
        updateUIForLimits();
        closeModal('auth-modal');
    }
}

async function handleSignOut() {
    await supabaseClient.auth.signOut();
    userState.userId = null;
    userState.role = 'guest';
    userState.messagesSentToday = parseInt(localStorage.getItem('Xyvro_MsgCount') || '0');
    updateUIForLimits();
    createNewChat();
}

function autoGrow(element) {
    element.style.height = "5px";
    element.style.height = (element.scrollHeight) + "px";
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); }
function openAuthModal() { if (userState.userId) { handleSignOut(); } else { openModal('auth-modal'); } }
function showPremiumModal() { openModal('premium-modal'); }
function showLimitModal() { openModal('limit-modal'); }
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOnOuterClick(event, id) { if (event.target === document.getElementById(id)) closeModal(id); }

initApp();
