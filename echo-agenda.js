// ==================== 状态管理 ====================
const STATE = {
    messages: [],
    tasks: [],
    isLoading: false,
    apiKey: null,
    aiProvider: 'openrouter',
    theme: 'dark',
    userContext: {
        anxietyLevel: 0,
        lastVisit: null,
        completedTasks: 0,
        totalTasks: 0
    },
    notionConfig: {
        token: null,
        databaseId: null
    },
    // 性能优化：API响应缓存
    apiCache: new Map(),
    cacheTimestamps: new Map(),
    // 插件系统
    plugins: {
        enabled: ['pyramid'], // 默认只启用任务金字塔
        layout: {
            pyramid: { x: 35, y: 10, width: 60, height: 80, minimized: false },
            tomato: { x: 2, y: 10, width: 30, height: 35, minimized: false },
            frog: { x: 2, y: 50, width: 30, height: 35, minimized: false }
        }
    },
    // 番茄钟状态
    tomatoTimer: {
        isActive: false,
        timeLeft: 25 * 60,
        mode: 'work', // 'work' or 'break'
        currentTask: null
    },
    // 吃青蛙任务
    frogTask: null,
    // 时间统计功能：记录每类作业的平均完成时间
    taskTimeStats: {},
    // 任务时间追踪：记录任务开始时间
    taskStartTime: {}
};

const STORAGE_KEYS = {
    MESSAGES: 'echoAgenda_messages',
    TASKS: 'echoAgenda_tasks',
    API_KEY: 'echoAgenda_apiKey',
    AI_PROVIDER: 'echoAgenda_aiProvider',
    THEME: 'echoAgenda_theme',
    USER_CONTEXT: 'echoAgenda_userContext',
    NOTION_TOKEN: 'echoAgenda_notionToken',
    NOTION_DATABASE_ID: 'echoAgenda_notionDatabaseId',
    PLUGINS: 'echoAgenda_plugins',
    EISENHOWER_MATRIX: 'echoAgenda_eisenhowerMatrix',
    TOMATO_TIMER: 'echoAgenda_tomatoTimer',
    FROG_TASK: 'echoAgenda_frogTask',
    INTRO_SHOWN: 'echoAgenda_introShown',
    TASK_TIME_STATS: 'echoAgenda_taskTimeStats',
    TASK_START_TIME: 'echoAgenda_taskStartTime'
};

// AI服务商配置
const AI_PROVIDERS = {
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        modelName: 'openrouter/free',
        docsUrl: 'https://openrouter.ai/openrouter/free'
    },
    deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        apiUrl: 'https://api.deepseek.com/chat/completions',
        modelName: 'deepseek-chat',
        docsUrl: 'https://platform.deepseek.com/'
    }
};

function getActiveProvider() {
    return AI_PROVIDERS[STATE.aiProvider] || AI_PROVIDERS.openrouter;
}

function isApiKeyFormatValid(providerId, key) {
    if (!key) return false;
    if (providerId === 'openrouter') {
        return key.startsWith('sk-or-') || key.startsWith('sk-');
    }
    return key.startsWith('sk-');
}

/** 首次进入且 localStorage 无密钥时，使用站点默认 OpenRouter Key（由 index.html 设置 window.__ECHO_AGENDA_DEFAULT_OPENROUTER_KEY__） */
function getDefaultOpenRouterApiKey() {
    if (typeof window === 'undefined') return '';
    const k = window.__ECHO_AGENDA_DEFAULT_OPENROUTER_KEY__;
    return typeof k === 'string' ? k.trim() : '';
}

function applyDefaultOpenRouterApiKeyIfNeeded() {
    if (STATE.apiKey) return;
    const key = getDefaultOpenRouterApiKey();
    if (!key || !isApiKeyFormatValid('openrouter', key)) return;
    STATE.apiKey = key;
    STATE.aiProvider = 'openrouter';
    saveToStorage();
}

// 插件定义
const PLUGINS = {
    pyramid: {
        name: '任务金字塔',
        icon: '🔺',
        description: '按优先级金字塔排序任务',
        defaultLayout: { x: 35, y: 5, width: 60, height: 85 }
    },
    tomato: {
        name: '番茄钟',
        icon: '🍅',
        description: '25分钟专注工作法',
        defaultLayout: { x: 2, y: 5, width: 30, height: 40 }
    },
    frog: {
        name: '吃青蛙',
        icon: '🐸',
        description: '优先完成最困难的任务',
        defaultLayout: { x: 2, y: 50, width: 30, height: 40 }
    }
};

// 缓存配置
const CACHE_CONFIG = {
    MAX_SIZE: 100, // 最大缓存条目数
    TTL: 30 * 60 * 1000, // 缓存有效期30分钟
    ENABLED: true // 是否启用缓存
};

// 减压建议库
const RELAXATION_TIPS = [
    "现在去喝一杯温水，深呼吸3次 💧",
    "站起来，伸展一下身体，感受肌肉的放松 🧘",
    "闭上眼睛，想象自己在一个宁静的地方 🌊",
    "播放一首你喜欢的轻松音乐 🎵",
    "望向窗外，观察天空的云朵 ☁️",
    "做一些简单的颈部和肩部旋转运动 🔄",
    "用冷水洗手，感受温度的变化 ❄️",
    "写下今天的一件小确幸 ✨",
    "整理一下你的书桌，让环境更整洁 📚",
    "给朋友发一条简单的问候信息 💬"
];

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    console.log('=== Echo Agenda 初始化开始 ===');
    loadFromStorage();
    applyDefaultOpenRouterApiKeyIfNeeded();
    
    // 加载主题
    loadTheme();
    
    if (STATE.apiKey) {
        console.log('✅ 已加载保存的API密钥');
        console.log('API密钥前缀:', STATE.apiKey.substring(0, 10) + '...');
    } else {
        console.log('⚠️ 未配置API密钥');
    }
    
    console.log('用户上下文:', STATE.userContext);
    console.log('任务数量:', STATE.tasks.length);
    console.log('消息数量:', STATE.messages.length);
    console.log('当前主题:', STATE.theme);
    console.log('启用的插件:', STATE.plugins.enabled);
    
    checkUserContext();
    renderMessages();
    renderTasks();
    renderPlugins();
    updateStats();
    setupEventListeners();
    setupPluginDrag();
    
    // 恢复番茄钟状态
    if (STATE.tomatoTimer.isActive) {
        resumeTomatoTimer();
    }
    
    // 检查是否显示介绍弹窗
    checkShowIntro();
    
    console.log('=== Echo Agenda 初始化完成 ===');
}

function setupEventListeners() {
    const input = document.getElementById('userInput');
    input.addEventListener('keypress', handleKeyPress);
    
    // 点击模态框外部关闭
    document.getElementById('apiModal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeApiConfig();
        }
    });

    document.getElementById('notionModal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeNotionConfig();
        }
    });
}

// ==================== 存储管理 ====================
function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(STATE.messages));
        localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(STATE.tasks));
        localStorage.setItem(STORAGE_KEYS.USER_CONTEXT, JSON.stringify(STATE.userContext));
        localStorage.setItem(STORAGE_KEYS.THEME, STATE.theme);
        localStorage.setItem(STORAGE_KEYS.PLUGINS, JSON.stringify(STATE.plugins));
        localStorage.setItem(STORAGE_KEYS.TOMATO_TIMER, JSON.stringify(STATE.tomatoTimer));
        localStorage.setItem(STORAGE_KEYS.FROG_TASK, JSON.stringify(STATE.frogTask));
        localStorage.setItem(STORAGE_KEYS.TASK_TIME_STATS, JSON.stringify(STATE.taskTimeStats));
        localStorage.setItem(STORAGE_KEYS.TASK_START_TIME, JSON.stringify(STATE.taskStartTime));
        
        if (STATE.apiKey) {
            localStorage.setItem(STORAGE_KEYS.API_KEY, STATE.apiKey);
        }
        localStorage.setItem(STORAGE_KEYS.AI_PROVIDER, STATE.aiProvider);
        if (STATE.notionConfig.token) {
            localStorage.setItem(STORAGE_KEYS.NOTION_TOKEN, STATE.notionConfig.token);
        }
        if (STATE.notionConfig.databaseId) {
            localStorage.setItem(STORAGE_KEYS.NOTION_DATABASE_ID, STATE.notionConfig.databaseId);
        }
    } catch (error) {
        console.error('保存到本地存储失败:', error);
        showToast('保存失败，请检查浏览器设置', 'error');
    }
}

function loadFromStorage() {
    try {
        const savedMessages = localStorage.getItem(STORAGE_KEYS.MESSAGES);
        const savedTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
        const savedApiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
        const savedUserContext = localStorage.getItem(STORAGE_KEYS.USER_CONTEXT);
        const savedNotionToken = localStorage.getItem(STORAGE_KEYS.NOTION_TOKEN);
        const savedNotionDatabaseId = localStorage.getItem(STORAGE_KEYS.NOTION_DATABASE_ID);
        const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
        const savedProvider = localStorage.getItem(STORAGE_KEYS.AI_PROVIDER);
        const savedPlugins = localStorage.getItem(STORAGE_KEYS.PLUGINS);
        const savedTomatoTimer = localStorage.getItem(STORAGE_KEYS.TOMATO_TIMER);
        const savedFrogTask = localStorage.getItem(STORAGE_KEYS.FROG_TASK);
        const savedTaskTimeStats = localStorage.getItem(STORAGE_KEYS.TASK_TIME_STATS);
        const savedTaskStartTime = localStorage.getItem(STORAGE_KEYS.TASK_START_TIME);
        
        if (savedMessages) STATE.messages = JSON.parse(savedMessages);
        if (savedTasks) STATE.tasks = JSON.parse(savedTasks);
        if (savedApiKey) STATE.apiKey = savedApiKey;
        if (savedUserContext) STATE.userContext = JSON.parse(savedUserContext);
        if (savedNotionToken) STATE.notionConfig.token = savedNotionToken;
        if (savedNotionDatabaseId) STATE.notionConfig.databaseId = savedNotionDatabaseId;
        if (savedTheme) STATE.theme = savedTheme;
        if (savedProvider && AI_PROVIDERS[savedProvider]) STATE.aiProvider = savedProvider;
        if (savedPlugins) STATE.plugins = JSON.parse(savedPlugins);
        if (savedTomatoTimer) STATE.tomatoTimer = JSON.parse(savedTomatoTimer);
        if (savedFrogTask) STATE.frogTask = JSON.parse(savedFrogTask);
        if (savedTaskTimeStats) STATE.taskTimeStats = JSON.parse(savedTaskTimeStats);
        if (savedTaskStartTime) STATE.taskStartTime = JSON.parse(savedTaskStartTime);
        
        // 清理旧的eisenhowerMatrix数据
        localStorage.removeItem('echoAgenda_eisenhowerMatrix');
    } catch (error) {
        console.error('从本地存储加载失败:', error);
        showToast('加载数据失败，将使用默认设置', 'error');
    }
}

// ==================== 用户上下文管理 ====================
function checkUserContext() {
    const today = new Date().toDateString();
    const lastVisit = STATE.userContext.lastVisit;
    
    if (lastVisit && lastVisit !== today) {
        const yesterdayCompleted = STATE.userContext.completedTasks;
        const yesterdayTotal = STATE.userContext.totalTasks;
        const yesterdayCompletion = yesterdayCompleted / Math.max(1, yesterdayTotal);

        // 新的一天，重置一些统计
        STATE.userContext.completedTasks = 0;
        STATE.userContext.totalTasks = 0;
        
        let greetingMessage = '';
        if (yesterdayCompletion > 0.8) {
            greetingMessage = `昨天你完成了 ${Math.round(yesterdayCompletion * 100)}% 的任务，太棒了！今天继续保持，我相信你可以做到的！🌟`;
        } else if (yesterdayCompletion > 0.5) {
            greetingMessage = `昨天你完成了 ${Math.round(yesterdayCompletion * 100)}% 的任务，还不错。今天我们从小目标开始，慢慢来 💪`;
        } else {
            greetingMessage = `新的一天开始了，不管昨天怎么样，今天都是新的开始。我们从一个简单的小任务开始，好吗？🌱`;
        }
        
        STATE.messages.push({
            role: 'assistant',
            content: greetingMessage
        });
    }
    
    STATE.userContext.lastVisit = today;
    saveToStorage();
}

function updateUserContext(taskCompleted) {
    if (taskCompleted) {
        STATE.userContext.completedTasks++;
        STATE.userContext.anxietyLevel = Math.max(0, STATE.userContext.anxietyLevel - 1);
    } else {
        STATE.userContext.totalTasks++;
        STATE.userContext.anxietyLevel = Math.min(10, STATE.userContext.anxietyLevel + 1);
    }
    saveToStorage();
}

// ==================== 主题管理 ====================
function loadTheme() {
    const body = document.body;
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    
    if (STATE.theme === 'light') {
        body.classList.add('light-theme');
        if (themeToggleBtn) {
            themeToggleBtn.textContent = '☀️';
        }
    } else {
        body.classList.remove('light-theme');
        if (themeToggleBtn) {
            themeToggleBtn.textContent = '🌙';
        }
    }
}

function toggleTheme() {
    STATE.theme = STATE.theme === 'dark' ? 'light' : 'dark';
    loadTheme();
    saveToStorage();
    showToast(`已切换到${STATE.theme === 'dark' ? '深色' : '浅色'}主题`, 'success');
}

// ==================== Toast 通知系统 ====================
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };
    
    toast.innerHTML = `
        <span>${icons[type] || 'ℹ️'}</span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== 消息处理 ====================
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    
    if (!message || STATE.isLoading) return;

    if (!STATE.apiKey) {
        showToast('请先配置API密钥', 'info');
        openApiConfig();
        return;
    }

    // 添加用户消息
    STATE.messages.push({ role: 'user', content: message });
    renderMessages();
    input.value = '';
    
    // 显示加载状态
    STATE.isLoading = true;
    updateSendButtonState();
    
    // 创建一个空的AI消息用于流式显示
    const streamingMessageId = Date.now();
    STATE.messages.push({ 
        role: 'assistant', 
        content: '', 
        isStreaming: true,
        id: streamingMessageId 
    });
    renderMessages();
    
    try {
        showToast('正在思考...', 'info');
        
        let fullText = '';
        const aiResponse = await callAI(message, (streamedContent) => {
            // 实时更新流式消息内容
            fullText = streamedContent;
            const streamingMsg = STATE.messages.find(m => m.id === streamingMessageId);
            if (streamingMsg) {
                streamingMsg.content = fullText;
                renderMessages();
            }
        });
        
        // 完成流式传输
        const streamingMsg = STATE.messages.find(m => m.id === streamingMessageId);
        if (streamingMsg) {
            streamingMsg.content = aiResponse.text;
            streamingMsg.isStreaming = false;
        }
        
        // 如果返回了任务，显示任务选择界面
        if (aiResponse.tasks && aiResponse.tasks.length > 0) {
            // 保存建议的任务
            STATE.suggestedTasks = aiResponse.tasks;
            
            // 显示任务选择界面
            showTaskSelectionModal(aiResponse.tasks);
        }
        
        renderMessages();
        saveToStorage();
        
    } catch (error) {
        console.error('AI调用失败:', error);
        console.error('完整错误信息:', JSON.stringify(error, null, 2));
        
        // 如果是 DeepSeek 的 402（余额/配额不足），自动切到 OpenRouter 免费路由
        if (
            typeof error?.message === 'string' &&
            error.message.includes('402') &&
            STATE.aiProvider === 'deepseek'
        ) {
            STATE.aiProvider = 'openrouter';
            STATE.apiKey = null; // 需要用户重新填 OpenRouter 的 key
            saveToStorage();
            showToast('DeepSeek 余额不足，已切换到 OpenRouter 免费路由，请重新配置 API Key', 'info');
            openApiConfig();
        }

        // 移除流式消息
        STATE.messages = STATE.messages.filter(m => m.id !== streamingMessageId);
        
        let errorMessage = '抱歉，我遇到了一些问题。';
        let debugInfo = '';
        
        if (error.message.includes('401') || error.message.includes('403')) {
            errorMessage = 'API密钥无效或已过期';
            debugInfo = '请检查API密钥是否正确配置';
        } else if (error.message.includes('402')) {
            errorMessage = '余额不足或免费额度已用完';
            debugInfo = '请检查 DeepSeek 的账户余额/配额，或稍后再试；也可降低 max_tokens 减少消耗。';
        } else if (error.message.includes('429')) {
            errorMessage = 'API调用次数已达上限';
            debugInfo = '请稍后再试，或检查DeepSeek账户的配额';
        } else if (error.message.includes('network') || error.name === 'TypeError') {
            errorMessage = '网络连接失败';
            debugInfo = '请检查你的网络连接';
        } else if (error.message.includes('API返回数据格式异常')) {
            errorMessage = 'AI服务返回了异常的数据';
            debugInfo = '请尝试重新发送消息';
        } else {
            errorMessage = `AI调用失败: ${error.message}`;
            debugInfo = '错误详情已记录在控制台';
        }
        
        const fullMessage = `${errorMessage}\n\n💡 ${debugInfo}`;
        
        STATE.messages.push({ 
            role: 'assistant', 
            content: fullMessage 
        });
        renderMessages();
        showToast('AI调用失败', 'error');
    } finally {
        STATE.isLoading = false;
        updateSendButtonState();
    }
}

function updateSendButtonState() {
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = STATE.isLoading;
    sendBtn.textContent = STATE.isLoading ? '发送中...' : '发送';
}

// ==================== 性能优化：缓存管理 ====================
function getCacheKey(userMessage) {
    // 生成缓存键，基于用户消息和焦虑程度
    return `${userMessage}_${STATE.userContext.anxietyLevel}`;
}

function getCachedResponse(cacheKey) {
    if (!CACHE_CONFIG.ENABLED) return null;
    
    const cached = STATE.apiCache.get(cacheKey);
    const timestamp = STATE.cacheTimestamps.get(cacheKey);
    
    if (!cached || !timestamp) return null;
    
    // 检查缓存是否过期
    const now = Date.now();
    if (now - timestamp > CACHE_CONFIG.TTL) {
        STATE.apiCache.delete(cacheKey);
        STATE.cacheTimestamps.delete(cacheKey);
        return null;
    }
    
    console.log('✅ 使用缓存响应');
    return cached;
}

function setCachedResponse(cacheKey, response) {
    if (!CACHE_CONFIG.ENABLED) return;
    
    // 检查缓存大小，如果超过限制则清理最旧的缓存
    if (STATE.apiCache.size >= CACHE_CONFIG.MAX_SIZE) {
        cleanOldestCache();
    }
    
    STATE.apiCache.set(cacheKey, response);
    STATE.cacheTimestamps.set(cacheKey, Date.now());
}

function cleanOldestCache() {
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, timestamp] of STATE.cacheTimestamps) {
        if (timestamp < oldestTime) {
            oldestTime = timestamp;
            oldestKey = key;
        }
    }
    
    if (oldestKey) {
        STATE.apiCache.delete(oldestKey);
        STATE.cacheTimestamps.delete(oldestKey);
    }
}

function clearExpiredCache() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, timestamp] of STATE.cacheTimestamps) {
        if (now - timestamp > CACHE_CONFIG.TTL) {
            expiredKeys.push(key);
        }
    }
    
    expiredKeys.forEach(key => {
        STATE.apiCache.delete(key);
        STATE.cacheTimestamps.delete(key);
    });
    
    console.log(`🧹 清理了 ${expiredKeys.length} 个过期缓存`);
}

// ==================== 性能优化：防抖和节流 ====================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 优化的渲染函数 - 避免流式消息闪烁
const optimizedRenderMessages = debounce(function() {
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return;
    
    // 智能DOM更新：只更新变化的内容
    const existingMessages = chatArea.querySelectorAll('.message');
    
    // 如果消息数量不匹配，重新渲染
    if (existingMessages.length !== STATE.messages.length) {
        renderMessagesCompletely(chatArea);
        return;
    }
    
    // 逐个比较和更新消息
    STATE.messages.forEach((msg, index) => {
        const messageDiv = existingMessages[index];
        if (!messageDiv) return;
        
        const isStreaming = msg.isStreaming;
        const currentContent = messageDiv.textContent;
        const newContent = msg.content;
        
        // 如果内容变化或流式状态变化，更新消息
        if (currentContent !== newContent || messageDiv.dataset.isStreaming !== String(isStreaming)) {
            if (isStreaming) {
                // 流式消息：只更新内容，保持光标
                const cursorSpan = messageDiv.querySelector('.streaming-cursor');
                messageDiv.textContent = msg.content;
                if (cursorSpan) {
                    messageDiv.appendChild(cursorSpan);
                }
                messageDiv.dataset.isStreaming = 'true';
            } else {
                // 非流式消息：直接设置文本内容
                messageDiv.textContent = msg.content;
                messageDiv.dataset.isStreaming = 'false';
            }
        }
    });
    
    // 滚动到底部
    chatArea.scrollTop = chatArea.scrollHeight;
}, 30); // 30ms防抖，更流畅

// 完全重新渲染消息（用于消息数量变化时）
function renderMessagesCompletely(chatArea) {
    const fragment = document.createDocumentFragment();
    
    STATE.messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role === 'user' ? 'user-message' : 'ai-message'}`;
        messageDiv.dataset.isStreaming = String(msg.isStreaming);
        
        // 处理流式响应的光标效果
        if (msg.isStreaming) {
            messageDiv.textContent = msg.content;
            const cursor = document.createElement('span');
            cursor.className = 'streaming-cursor';
            messageDiv.appendChild(cursor);
        } else {
            messageDiv.textContent = msg.content;
        }
        
        fragment.appendChild(messageDiv);
    });
    
    chatArea.innerHTML = '';
    chatArea.appendChild(fragment);
    chatArea.scrollTop = chatArea.scrollHeight;
}

let optimizedRenderTasks = debounce(function() {
    const tasksArea = document.getElementById('tasksArea');
    if (!tasksArea) return;
    
    if (STATE.tasks.length === 0) {
        tasksArea.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🧘</div>
                <p>深呼吸，先从一个小任务开始...</p>
            </div>
        `;
        return;
    }
    
    // 使用文档片段减少DOM操作
    const fragment = document.createDocumentFragment();
    
    STATE.tasks.forEach(task => {
        const taskCard = document.createElement('div');
        taskCard.className = `task-card ${task.completed ? 'completed' : ''}`;
        taskCard.setAttribute('data-task-id', task.id);
        
        const priorityClass = `priority-${task.priority}`;
        const priorityText = {
            high: '🔥 高优先级',
            medium: '⚡ 中优先级',
            low: '🌱 低优先级'
        }[task.priority];
        
// 添加难度降级按钮
        if (task.difficultyReduction && !task.completed) {
            taskHTML += `<button class="difficulty-btn" data-task-id="${task.id}" title="降低难度">📉 降级</button>`;
        }
        
        taskHTML += `<button class="delete-btn" data-task-id="${task.id}" title="删除任务">删除</button>`;
        
        taskCard.innerHTML = taskHTML;
        
        // 点击卡片切换完成状态
        taskCard.onclick = (e) => {
            if (!e.target.classList.contains('delete-btn') && !e.target.classList.contains('difficulty-btn')) {
                toggleTask(task.id, e);
            }
        };
        
        // 添加拖拽功能
        taskCard.draggable = true;
        taskCard.ondragstart = (e) => handleDragStart(e, task.id);
        taskCard.ondragover = (e) => handleDragOver(e);
        taskCard.ondrop = (e) => handleDrop(e, task.id);
        
        fragment.appendChild(taskCard);
    });
    
    tasksArea.innerHTML = '';
    tasksArea.appendChild(fragment);
}, 50); // 50ms防抖

// ==================== AI 调用 ====================
async function callAI(userMessage, onStreamUpdate) {
    const provider = getActiveProvider();
    const anxietyContext = STATE.userContext.anxietyLevel > 5 
        ? '用户当前焦虑程度较高，需要特别温柔和鼓励的回应，避免增加压力。'
        : '用户当前状态良好，可以给出更有建设性的建议。';
    
    const systemPrompt = `你是一个专门帮助学生缓解焦虑、提高效率的智能助理。你的使命是帮助用户将模糊的压力碎裂成可执行的微小任务。

${anxietyContext}

请按照以下格式回复：
1. 首先给用户一个温暖、理解的回应（2-3句话），共情用户的感受
2. 然后分析用户提到的任务，给出建议和选项
3. 最多返回3个任务选项，让用户选择
4. 对于每个任务，提供"难度降级"的建议（如果任务太难）

用户输入：${userMessage}

请严格按照以下JSON格式返回任务（如果有任务的话）：
\`\`\`json
{
    "text": "你的温暖回应和建议",
    "tasks": [
        {
            "name": "任务名称（拆解后的小任务）",
            "duration": "预计时长（仅在用户明确提到时间时才添加，如用户说'30分钟'才添加，否则不添加此字段）",
            "priority": "high/medium/low",
            "difficultyReduction": "如果任务太难，如何降级（如：只做5分钟、先看目录等）"
        }
    ]
}
\`\`\`

重要原则：
- 如果用户表达焦虑，首先给予情感支持
- 最多返回3个任务选项，不要创建太多任务
- 将大任务拆解成具体可执行的小任务
- 只有在用户明确提到时间（如"30分钟"、"2小时"）时才在duration字段中添加时间信息，否则不添加此字段
- 优先级要合理，不要所有任务都是high
- 如果用户只是简单地说要做某事，只创建1个任务
- 如果没有明确任务，tasks字段设为空数组`;

    // 检查缓存
    const cacheKey = getCacheKey(userMessage);
    const cachedResponse = getCachedResponse(cacheKey);
    
    if (cachedResponse) {
        // 如果有缓存，模拟流式响应
        if (onStreamUpdate) {
            const fullText = cachedResponse.text;
            const chunkSize = Math.max(1, Math.floor(fullText.length / 10));
            
            for (let i = 0; i <= fullText.length; i += chunkSize) {
                onStreamUpdate(fullText.substring(0, i));
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        
        return cachedResponse;
    }

    try {
        console.log(`开始调用${provider.name} API（流式响应）...`);
        console.log('API密钥前缀:', STATE.apiKey ? STATE.apiKey.substring(0, 10) + '...' : '未设置');
        
        // OpenRouter / DeepSeek 均使用 OpenAI 兼容格式
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${STATE.apiKey}`
        };
        if (provider.id === 'openrouter') {
            headers['HTTP-Referer'] = window.location.origin || 'http://localhost';
            headers['X-Title'] = 'Echo Agenda';
        }

        const response = await fetch(provider.apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: provider.modelName,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专门帮助学生缓解焦虑、提高效率的智能助理。你擅长将模糊的压力碎裂成可执行的微小任务，并且总是以温暖、理解的方式回应。'
                    },
                    {
                        role: 'user',
                        content: systemPrompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1500,
                stream: true
            })
        });

        console.log('API响应状态:', response.status);
        
        if (!response.ok) {
            // 兼容不同供应商返回：有的返回 JSON，有的返回纯文本
            const responseText = await response.text().catch(() => '');
            let errorData = {};
            try {
                errorData = responseText ? JSON.parse(responseText) : {};
            } catch (_) {
                errorData = { raw: responseText };
            }
            console.error('API错误详情(原始):', responseText);
            console.error('API错误详情(解析后):', errorData);

            const messageFromBody =
                errorData?.error?.message ||
                errorData?.message ||
                errorData?.detail ||
                response.statusText;

            throw new Error(
                `API调用失败: ${response.status} ${messageFromBody}` +
                (responseText ? `\n\n${responseText}` : '')
            );
        }

        // 处理流式响应（OpenAI格式）
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        
        // 说明：
        // OpenAI/兼容服务的流式响应通常是 SSE 格式：每条消息以 `data:` 开头。
        // 网络分片可能导致一行 `data:` 在多次读取中被截断，所以需要缓冲后再解析完整行。
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line.startsWith('data:')) continue;

                const data = line.slice('data:'.length).trim();
                if (!data || data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        fullContent += content;
                        onStreamUpdate?.(fullContent);
                    }
                } catch (e) {
                    // 忽略解析错误（可能是非 JSON 的事件行或被截断的数据）
                }
            }
        }

        // flush 一次剩余缓冲（如果最后一块刚好包含完整 data 行）
        const tail = buffer.trim();
        if (tail.startsWith('data:')) {
            const data = tail.slice('data:'.length).trim();
            if (data && data !== '[DONE]') {
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) onStreamUpdate?.(fullContent + content);
                } catch (e) {
                    // ignore
                }
            }
        }
        
        console.log('AI完整回复内容:', fullContent);
        const parsedResponse = parseAIResponse(fullContent);
        
        // 缓存响应
        setCachedResponse(cacheKey, parsedResponse);
        
        return parsedResponse;
        
    } catch (error) {
        console.error('AI调用详细错误:', error);
        console.error('错误类型:', error.name);
        console.error('错误消息:', error.message);
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('网络连接失败');
        }
        throw error;
    }
}

function parseAIResponse(content) {
    try {
        // 尝试提取JSON代码块
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1]);
        }
        
        // 如果没有代码块，尝试直接解析
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            return JSON.parse(content.substring(jsonStart, jsonEnd + 1));
        }
        
        // 如果都不是，返回纯文本
        return {
            text: content,
            tasks: []
        };
    } catch (e) {
        console.error('JSON解析失败:', e);
        return {
            text: content,
            tasks: []
        };
    }
}

// ==================== 渲染函数 ====================
function renderMessages() {
    // 使用优化的渲染函数
    optimizedRenderMessages();
}

function renderTasks() {
    // 使用优化的渲染函数
    optimizedRenderTasks();
}

// ==================== 任务管理 ====================
function toggleTask(taskId, event) {
    const task = STATE.tasks.find(t => String(t.id) === String(taskId));
    if (task) {
        task.completed = !task.completed;
        
        // 如果任务完成了，记录完成时间并更新统计
        if (task.completed) {
            const completionTime = Date.now();
            const startTime = task.createdAt || STATE.taskStartTime[taskId] || (Date.now() - 60000); // 默认假设1分钟前创建
            const duration = (completionTime - startTime) / 1000 / 60; // 转换为分钟
            
            // 提取任务类别（去掉特殊字符和数字）
            const taskCategory = task.name.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '').substring(0, 10);
            
            if (taskCategory && taskCategory.length > 1) { // 确保类别有意义
                // 更新该类任务的时间统计
                if (!STATE.taskTimeStats[taskCategory]) {
                    STATE.taskTimeStats[taskCategory] = {
                        count: 0,
                        totalTime: 0,
                        averageTime: 0
                    };
                }
                
                STATE.taskTimeStats[taskCategory].count++;
                STATE.taskTimeStats[taskCategory].totalTime += duration;
                STATE.taskTimeStats[taskCategory].averageTime = 
                    STATE.taskTimeStats[taskCategory].totalTime / STATE.taskTimeStats[taskCategory].count;
                
                console.log(`任务统计: ${taskCategory} - 用时: ${duration.toFixed(1)}分钟 - 平均时间: ${STATE.taskTimeStats[taskCategory].averageTime.toFixed(1)}分钟`);
                
                // 提示用户时间统计信息
                showToast(`任务完成！用时${duration.toFixed(1)}分钟`, 'success');
            }
            
            // 清除开始时间记录
            if (STATE.taskStartTime[taskId]) {
                delete STATE.taskStartTime[taskId];
            }
            saveToStorage();
        }
        
        renderTasks();
        renderPyramid(); // 重新渲染金字塔
        updateStats();
        saveToStorage();
        
        // 更新用户上下文
        updateUserContext(task.completed);
        
        if (task.completed) {
            showToast('任务完成！太棒了！🎉', 'success');
            // 触发粒子效果
            if (event) {
                createParticleEffect(event.clientX, event.clientY);
            }
            // 自动显示一条减压建议
            const tip = RELAXATION_TIPS[Math.floor(Math.random() * RELAXATION_TIPS.length)];
            STATE.messages.push({ role: 'assistant', content: `✨ 完成了一个任务！${tip}` });
            renderMessages();
        } else {
            showToast('任务已恢复', 'info');
        }
    }
}

// ==================== DDL辅助函数 ====================
function formatDateDeadline(deadline) {
    if (!deadline) return '';
    try {
        const date = new Date(deadline);
        if (isNaN(date.getTime())) return deadline;
        
        const now = new Date();
        const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            return `已逾期 ${Math.abs(diffDays)} 天`;
        } else if (diffDays === 0) {
            return '今天截止';
        } else if (diffDays === 1) {
            return '明天截止';
        } else if (diffDays <= 7) {
            return `${diffDays}天后截止`;
        } else {
            return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
        }
    } catch (e) {
        return deadline;
    }
}

function isDeadlineUrgent(deadline) {
    if (!deadline) return false;
    try {
        const date = new Date(deadline);
        const now = new Date();
        const diffDays = (date - now) / (1000 * 60 * 60 * 24);
        return diffDays <= 3 && diffDays >= 0; // 3天内为紧急
    } catch (e) {
        return false;
    }
}

// ==================== DDL管理功能 ====================
function editTaskDeadline(taskId, event) {
    event.stopPropagation();
    const task = STATE.tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    
    const currentDeadline = task.deadline ? task.deadline : '';
    const newDeadline = prompt('请输入任务截止时间（格式：YYYY-MM-DD HH:mm）:', currentDeadline);
    
    if (newDeadline !== null) {
        if (newDeadline.trim() === '') {
            delete task.deadline;
            showToast('已删除任务截止时间', 'success');
        } else {
            task.deadline = newDeadline.trim();
            showToast('任务截止时间已更新', 'success');
        }
        saveToStorage();
        renderTasks();
    }
}

// ==================== 难度降级功能 ====================
function reduceDifficulty(taskId, event) {
    event.stopPropagation();
    
    // 使用字符串比较来避免浮点数精度问题
    const task = STATE.tasks.find(t => String(t.id) === String(taskId));
    
    if (!task) {
        console.error('未找到任务:', taskId);
        return;
    }
    
    console.log('找到任务:', task.name, 'ID:', task.id);
    
    // 检查任务是否已经降级过
    if (task.isReduced) {
        showToast('这个任务已经降级过了', 'info');
        return;
    }
    
    if (task.difficultyReduction) {
        const newTask = {
            ...task,
            id: Date.now() + Math.random(), // 生成新的任务ID
            name: `📉 ${task.name}（降级版）`,
            priority: task.priority === 'high' ? 'medium' : 'low',
            duration: '5分钟',
            difficultyReduction: '',
            isReduced: false, // 降级任务不应该标记为已降级
            originalTaskId: task.id, // 记录原任务ID
            completed: false // 确保降级任务未完成
        };
        
        // 标记原任务为已降级，但不删除
        task.isReduced = true;
        
        console.log('原任务标记为已降级:', task.name);
        console.log('创建降级任务:', newTask.name);
        
        STATE.tasks.push(newTask);
        saveToStorage();
        renderTasks();
        showToast('已创建降级任务', 'success');
        
        // 验证任务是否正确添加
        console.log('当前任务数量:', STATE.tasks.length);
        console.log('原任务是否存在:', STATE.tasks.find(t => String(t.id) === String(task.id)));
    }
}

// ==================== 粒子效果 ====================
function createParticleEffect(x, y) {
    const container = document.getElementById('particlesContainer');
    const colors = ['#4caf50', '#66bb6a', '#81c784', '#a5d6a7', '#ffd700', '#ff6b6b'];
    
    // 创建更多粒子，增强效果
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        const size = Math.random() * 12 + 4;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const angle = (Math.PI * 2 * i) / 30;
        const velocity = Math.random() * 150 + 80;
        const endX = x + Math.cos(angle) * velocity;
        const endY = y + Math.sin(angle) * velocity;
        
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.background = color;
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.boxShadow = `0 0 ${size * 2}px ${color}`;
        particle.style.borderRadius = Math.random() > 0.5 ? '50%' : '0'; // 随机圆形或方形
        
        container.appendChild(particle);
        
        // 增强的动画效果
        particle.animate([
            { 
                transform: 'translate(0, 0) scale(1) rotate(0deg)',
                opacity: 1 
            },
            { 
                transform: `translate(${endX - x}px, ${endY - y}px) scale(0) rotate(${Math.random() * 360}deg)`,
                opacity: 0 
            }
        ], {
            duration: 1200 + Math.random() * 400,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        });
        
        // 清理
        setTimeout(() => particle.remove(), 1600);
    }
    
    // 添加爆炸声效果（可选，需要用户授权）
    // playSound('complete');
}

function deleteTask(taskId, event) {
    event.stopPropagation();
    
    if (confirm('确定要删除这个任务吗？')) {
        STATE.tasks = STATE.tasks.filter(t => String(t.id) !== String(taskId));
        renderTasks();
        renderPyramid(); // 重新渲染金字塔
        updateStats();
        saveToStorage();
        showToast('任务已删除', 'success');
    }
}

function clearAllTasks() {
    if (confirm('确定要清空所有任务吗？此操作不可恢复。')) {
        STATE.tasks = [];
        renderTasks();
        updateStats();
        saveToStorage();
        showToast('所有任务已清空', 'success');
    }
}

// ==================== 任务排序 ====================
function sortTasks() {
    const sortType = document.getElementById('sortSelect').value;
    
    switch (sortType) {
        case 'priority':
            STATE.tasks.sort((a, b) => {
                const priorityOrder = { high: 0, medium: 1, low: 2 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            });
            break;
        case 'duration':
            STATE.tasks.sort((a, b) => {
                const durationA = parseInt(a.duration) || 0;
                const durationB = parseInt(b.duration) || 0;
                return durationA - durationB;
            });
            break;
        case 'name':
            STATE.tasks.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'default':
        default:
            STATE.tasks.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            break;
    }
    
    renderTasks();
    saveToStorage();
    showToast('任务已重新排序', 'info');
}

// ==================== 统计更新 ====================
function updateStats() {
    const total = STATE.tasks.length;
    const completed = STATE.tasks.filter(t => t.completed).length;
    
    document.getElementById('totalTasks').textContent = total;
    document.getElementById('completedTasks').textContent = completed;
}

// ==================== API 配置管理 ====================
function openApiConfig() {
    const providerSelect = document.getElementById('providerSelect');
    if (providerSelect) {
        providerSelect.value = STATE.aiProvider;
    }
    onProviderChange();
    document.getElementById('apiModal').classList.add('active');
    document.getElementById('apiKeyInput').value = STATE.apiKey || '';
}

function closeApiConfig() {
    document.getElementById('apiModal').classList.remove('active');
}

async function testApiConnection() {
    const providerId = document.getElementById('providerSelect')?.value || STATE.aiProvider;
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.openrouter;
    const testKey = document.getElementById('apiKeyInput').value.trim();
    
    if (!testKey) {
        showToast('请先输入API密钥', 'error');
        return;
    }
    
    if (!isApiKeyFormatValid(providerId, testKey)) {
        showToast(`无效的${provider.name} API密钥格式`, 'error');
        return;
    }
    
    showToast('正在测试连接...', 'info');
    
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testKey}`
        };
        if (provider.id === 'openrouter') {
            headers['HTTP-Referer'] = window.location.origin || 'http://localhost';
            headers['X-Title'] = 'Echo Agenda';
        }

        const response = await fetch(provider.apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: provider.modelName,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant.'
                    },
                    {
                        role: 'user',
                        content: 'Hello!'
                    }
                ],
                stream: false
            })
        });

        if (response.ok) {
            showToast(`✅ ${provider.name}连接成功！密钥有效`, 'success');
        } else {
            const errorData = await response.json().catch(() => ({}));
            showToast(`❌ 连接失败: ${response.status} - ${errorData.error?.message || '未知错误'}`, 'error');
        }
    } catch (error) {
        console.error('测试连接失败:', error);
        showToast(`❌ 网络错误: ${error.message}`, 'error');
    }
}

function saveApiKey() {
    const providerId = document.getElementById('providerSelect')?.value || STATE.aiProvider;
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.openrouter;
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    
    if (!apiKey) {
        showToast('请输入API密钥', 'error');
        return;
    }
    
    if (!isApiKeyFormatValid(providerId, apiKey)) {
        showToast(`无效的${provider.name} API密钥格式`, 'error');
        return;
    }
    
    STATE.apiKey = apiKey;
    STATE.aiProvider = providerId;
    saveToStorage();
    closeApiConfig();
    showToast(`${provider.name}配置已保存`, 'success');
}

// ==================== 拖拽排序功能 ====================
let draggedTaskId = null;
let draggedTaskData = null;

function handleDragStart(e, taskId) {
    draggedTaskId = String(taskId);
    
    // 获取任务数据
    const task = STATE.tasks.find(t => String(t.id) === String(taskId));
    if (task) {
        draggedTaskData = {
            taskId: task.id,
            name: task.name,
            duration: task.duration,
            priority: task.priority,
            difficultyReduction: task.difficultyReduction
        };
        console.log('拖拽开始 - 任务ID:', taskId, '任务名称:', task.name);
    } else {
        console.error('未找到任务:', taskId);
    }
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'task',
        taskId: taskId,
        data: draggedTaskData
    }));
    e.target.style.opacity = '0.5';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e, targetTaskId) {
    e.preventDefault();
    
    // 检查是否是拖拽到任务排序
    if (String(draggedTaskId) === String(targetTaskId)) return;

    const draggedIndex = STATE.tasks.findIndex(t => String(t.id) === String(draggedTaskId));
    const targetIndex = STATE.tasks.findIndex(t => String(t.id) === String(targetTaskId));

    if (draggedIndex !== -1 && targetIndex !== -1) {
        const [draggedTask] = STATE.tasks.splice(draggedIndex, 1);
        STATE.tasks.splice(targetIndex, 0, draggedTask);
        
        renderTasks();
        saveToStorage();
        showToast('任务顺序已调整', 'info');
    }
    
    // 重置样式
    const taskCards = document.querySelectorAll('.task-card');
    taskCards.forEach(card => card.style.opacity = '1');
    
    // 重置拖拽数据
    draggedTaskId = null;
    draggedTaskData = null;
}

// ==================== Notion 联动功能 ====================
function openNotionConfig() {
    document.getElementById('notionModal').classList.add('active');
    document.getElementById('notionToken').value = STATE.notionConfig.token || '';
    document.getElementById('notionDatabaseId').value = STATE.notionConfig.databaseId || '';
}

function closeNotionConfig() {
    document.getElementById('notionModal').classList.remove('active');
}

function saveNotionConfig() {
    const token = document.getElementById('notionToken').value.trim();
    const databaseId = document.getElementById('notionDatabaseId').value.trim();
    
    if (!token || !databaseId) {
        showToast('请填写完整的Notion配置信息', 'error');
        return;
    }
    
    STATE.notionConfig.token = token;
    STATE.notionConfig.databaseId = databaseId;
    saveToStorage();
    closeNotionConfig();
    showToast('Notion配置已保存', 'success');
}

async function syncToNotion() {
    if (!STATE.notionConfig.token || !STATE.notionConfig.databaseId) {
        showToast('请先配置Notion', 'info');
        openNotionConfig();
        return;
    }

    if (STATE.tasks.length === 0) {
        showToast('没有任务可同步', 'info');
        return;
    }

    try {
        showToast('正在同步到Notion...', 'info');
        
        // 为每个任务创建一个页面
        const promises = STATE.tasks.map(async (task) => {
            const response = await fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${STATE.notionConfig.token}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({
                    parent: {
                        database_id: STATE.notionConfig.databaseId
                    },
                    properties: {
                        Name: {
                            title: [
                                {
                                    text: {
                                        content: task.name
                                    }
                                }
                            ]
                        },
                        Priority: {
                            select: {
                                name: task.priority
                            }
                        },
                        Status: {
                            select: {
                                name: task.completed ? 'Done' : 'To Do'
                            }
                        },
                        Duration: {
                            rich_text: [
                                {
                                    text: {
                                        content: task.duration
                                    }
                                }
                            ]
                        }
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error(`同步任务失败: ${task.name}`);
            }
            
            return response.json();
        });

        await Promise.all(promises);
        showToast(`成功同步 ${STATE.tasks.length} 个任务到Notion！🎉`, 'success');
        
    } catch (error) {
        console.error('同步到Notion失败:', error);
        showToast('同步到Notion失败，请检查配置', 'error');
    }
}

// ==================== 清空压力功能 ====================
function clearAllPressure() {
    if (STATE.tasks.length === 0) {
        showToast('今日已经很轻松了！🌸', 'info');
        return;
    }

    if (confirm('确定要清空今日所有压力吗？这将删除所有任务，让你重新开始。')) {
        STATE.tasks = [];
        STATE.userContext.anxietyLevel = 0;
        STATE.userContext.completedTasks = 0;
        STATE.userContext.totalTasks = 0;
        
        renderTasks();
        updateStats();
        saveToStorage();
        
        // 添加一条鼓励的消息
        STATE.messages.push({
            role: 'assistant',
            content: '🌸 压力已清空！深呼吸，感受此刻的宁静。无论今天有什么，我们都可以从现在开始。'
        });
        renderMessages();
        
        showToast('今日压力已清空，重新开始吧！🌸', 'success');
    }
}

// ==================== 任务选择功能 ====================
function showTaskSelectionModal(tasks) {
    const modal = document.getElementById('taskSelectionModal');
    const taskList = document.getElementById('taskSelectionList');
    
    // 生成任务列表
    taskList.innerHTML = '';
    
    tasks.forEach((task, index) => {
        const item = document.createElement('div');
        item.className = 'task-selection-item';
        item.dataset.index = index;
        
        const priorityText = {
            high: '🔥 高',
            medium: '⚡ 中',
            low: '🌱 低'
        }[task.priority];
        
        item.innerHTML = `
            <input type="checkbox" class="task-selection-checkbox" checked>
            <div class="task-selection-content">
                <div class="task-selection-name">${task.name}</div>
                <div class="task-selection-details">
                    <span class="task-selection-tag priority">${priorityText}</span>
                    <span class="task-selection-tag duration">⏱️ ${task.duration}</span>
                </div>
                ${task.difficultyReduction ? `<div class="task-selection-reduction">💡 降级建议：${task.difficultyReduction}</div>` : ''}
            </div>
        `;
        
        // 点击整个项切换选中状态
        item.onclick = (e) => {
            if (e.target.type !== 'checkbox') {
                const checkbox = item.querySelector('.task-selection-checkbox');
                checkbox.checked = !checkbox.checked;
                item.classList.toggle('selected', checkbox.checked);
            } else {
                item.classList.toggle('selected', e.target.checked);
            }
        };
        
        // 初始选中状态
        item.classList.add('selected');
        
        taskList.appendChild(item);
    });
    
    modal.classList.add('active');
}

function closeTaskSelectionModal() {
    const modal = document.getElementById('taskSelectionModal');
    modal.classList.remove('active');
    STATE.suggestedTasks = null;
}

function createSelectedTasks() {
    if (!STATE.suggestedTasks || STATE.suggestedTasks.length === 0) return;
    
    const taskList = document.getElementById('taskSelectionList');
    const items = taskList.querySelectorAll('.task-selection-item');
    const selectedTasks = [];
    
    items.forEach((item, index) => {
        const checkbox = item.querySelector('.task-selection-checkbox');
        if (checkbox.checked) {
            selectedTasks.push(STATE.suggestedTasks[index]);
        }
    });
    
    if (selectedTasks.length === 0) {
        showToast('请至少选择一个任务', 'info');
        return;
    }
    
    // 创建选中的任务
    selectedTasks.forEach(task => {
        STATE.tasks.push({
            id: Date.now() + Math.random(),
            name: task.name,
            duration: task.duration,
            priority: task.priority,
            completed: false,
            createdAt: Date.now(),
            difficultyReduction: task.difficultyReduction || '',
            isReduced: false
        });
    });
    
    // 重新应用当前排序
    sortTasks();
    
    // 更新用户上下文
    updateUserContext(false);
    
    closeTaskSelectionModal();
    saveToStorage();
    renderTasks();
    showToast(`已创建 ${selectedTasks.length} 个任务`, 'success');
    
    // 如果焦虑程度较高，添加一条减压建议
    if (STATE.userContext.anxietyLevel > 5) {
        setTimeout(() => {
            const tip = RELAXATION_TIPS[Math.floor(Math.random() * RELAXATION_TIPS.length)];
            STATE.messages.push({ role: 'assistant', content: `💡 小贴士：${tip}` });
            renderMessages();
        }, 1500);
    }
}

function createAllTasks() {
    if (!STATE.suggestedTasks || STATE.suggestedTasks.length === 0) return;
    
    // 创建所有任务
    STATE.suggestedTasks.forEach(task => {
        STATE.tasks.push({
            id: Date.now() + Math.random(),
            name: task.name,
            duration: task.duration,
            priority: task.priority,
            completed: false,
            createdAt: Date.now(),
            difficultyReduction: task.difficultyReduction || '',
            isReduced: false
        });
    });
    
    // 重新应用当前排序
    sortTasks();
    
    // 更新用户上下文
    updateUserContext(false);
    
    closeTaskSelectionModal();
    saveToStorage();
    renderTasks();
    showToast(`已创建 ${STATE.suggestedTasks.length} 个任务`, 'success');
    
    // 如果焦虑程度较高，添加一条减压建议
    if (STATE.userContext.anxietyLevel > 5) {
        setTimeout(() => {
            const tip = RELAXATION_TIPS[Math.floor(Math.random() * RELAXATION_TIPS.length)];
            STATE.messages.push({ role: 'assistant', content: `💡 小贴士：${tip}` });
            renderMessages();
        }, 1500);
    }
}

// ==================== 调试工具 ====================
// 将调试函数暴露到全局作用域，方便在控制台调用
window.debugEchoAgenda = function() {
    console.log('=== Echo Agenda 调试信息 ===');
    console.log('AI服务商:', getActiveProvider().name);
    console.log('API密钥状态:', STATE.apiKey ? '已配置' : '未配置');
    console.log('API密钥前缀:', STATE.apiKey ? STATE.apiKey.substring(0, 10) + '...' : 'N/A');
    console.log('用户上下文:', STATE.userContext);
    console.log('任务列表:', STATE.tasks);
    console.log('消息历史:', STATE.messages);
    console.log('Notion配置:', STATE.notionConfig);
    console.log('缓存大小:', STATE.apiCache.size);
    console.log('============================');
};

window.resetApiKey = function() {
    STATE.apiKey = null;
    saveToStorage();
    console.log('✅ API密钥已清除');
    showToast('API密钥已清除，请重新配置', 'success');
};

window.clearAllData = function() {
    localStorage.clear();
    console.log('✅ 所有本地数据已清除');
    showToast('所有数据已清除，请刷新页面', 'success');
};

console.log('💡 调试提示：在控制台输入 debugEchoAgenda() 查看调试信息');
console.log('💡 调试提示：在控制台输入 clearAllData() 清除所有数据');
console.log('💡 提示：可优先使用 OpenRouter 免费路由：https://openrouter.ai/openrouter/free');

// ==================== 插件管理系统 ====================
function openPluginSelector() {
    const modal = document.getElementById('pluginModal');
    const pluginList = document.getElementById('pluginList');
    
    // 生成插件列表
    pluginList.innerHTML = '';
    Object.entries(PLUGINS).forEach(([pluginId, plugin]) => {
        const isEnabled = STATE.plugins.enabled.includes(pluginId);
        
        const item = document.createElement('div');
        item.className = `plugin-item ${isEnabled ? 'active' : ''}`;
        item.innerHTML = `
            <input type="checkbox" class="plugin-item-checkbox" 
                   ${isEnabled ? 'checked' : ''} 
                   onchange="togglePluginCheckbox('${pluginId}')">
            <span class="plugin-item-icon">${plugin.icon}</span>
            <div class="plugin-item-info">
                <div class="plugin-item-name">${plugin.name}</div>
                <div class="plugin-item-desc">${plugin.description}</div>
            </div>
        `;
        
        item.onclick = (e) => {
            if (e.target.type !== 'checkbox') {
                togglePluginCheckbox(pluginId);
            }
        };
        
        pluginList.appendChild(item);
    });
    
    modal.classList.add('active');
}

function closePluginSelector() {
    document.getElementById('pluginModal').classList.remove('active');
}

function togglePluginCheckbox(pluginId) {
    const checkbox = document.querySelector(`input[onchange="togglePluginCheckbox('${pluginId}')"]`);
    const item = checkbox.closest('.plugin-item');
    
    if (checkbox.checked) {
        if (!STATE.plugins.enabled.includes(pluginId)) {
            STATE.plugins.enabled.push(pluginId);
            // 自动布局新插件
            autoLayoutPlugin(pluginId);
        }
        item.classList.add('active');
    } else {
        STATE.plugins.enabled = STATE.plugins.enabled.filter(id => id !== pluginId);
        item.classList.remove('active');
    }
}

function savePluginConfig() {
    saveToStorage();
    renderPlugins();
    closePluginSelector();
    showToast('插件配置已保存', 'success');
}

function togglePlugin(pluginId) {
    STATE.plugins.enabled = STATE.plugins.enabled.filter(id => id !== pluginId);
    saveToStorage();
    renderPlugins();
    showToast(`${PLUGINS[pluginId].name}已关闭`, 'info');
}

function autoLayoutPlugin(pluginId) {
    const enabledPlugins = STATE.plugins.enabled.filter(id => id !== pluginId);
    const layout = STATE.plugins.layout;
    
    // 简单的网格布局算法
    const positions = [
        { x: 2, y: 10, width: 30, height: 35 },   // 左上
        { x: 2, y: 50, width: 30, height: 35 },   // 左下
        { x: 35, y: 10, width: 60, height: 80 },  // 右侧大
        { x: 68, y: 10, width: 28, height: 35 },  // 右上
        { x: 68, y: 50, width: 28, height: 35 }   // 右下
    ];
    
    // 找到第一个可用的位置
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const isOccupied = enabledPlugins.some(pid => {
            const p = layout[pid];
            return p && Math.abs(p.x - pos.x) < 5 && Math.abs(p.y - pos.y) < 5;
        });
        
        if (!isOccupied) {
            layout[pluginId] = { ...pos, minimized: false };
            return;
        }
    }
    
    // 如果没有位置，使用默认位置
    layout[pluginId] = { ...PLUGINS[pluginId].defaultLayout, minimized: false };
}

function renderPlugins() {
    const container = document.getElementById('pluginsContainer');
    
    // 隐藏所有插件
    document.querySelectorAll('.plugin-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    // 显示启用的插件
    STATE.plugins.enabled.forEach(pluginId => {
        const panel = document.getElementById(`${pluginId}Plugin`);
        if (panel) {
            panel.style.display = 'flex';
            applyPluginLayout(pluginId);
            
            // 添加调整大小的手柄（如果还没有的话）
            if (!panel.querySelector('.resize-handle.nw')) {
                addResizeHandles(panel);
            }
        }
    });
    
    // 渲染插件内容
    renderPyramid();
    renderTomatoTimer();
    renderFrogTask();
}

function addResizeHandles(panel) {
    const handles = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
    
    handles.forEach(position => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${position}`;
        handle.dataset.position = position;
        
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startResize(e, panel, position);
        });
        
        panel.appendChild(handle);
    });
}

function startResize(e, panel, position) {
    const container = document.getElementById('pluginsContainer');
    const containerRect = container.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelRect.width;
    const startHeight = panelRect.height;
    const startLeft = panelRect.left - containerRect.left;
    const startTop = panelRect.top - containerRect.top;
    
    const isDragging = true;
    
    // 禁用插件拖动
    panel.dataset.resizing = 'true';
    
    document.onmousemove = (e) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;
        
        // 根据手柄位置调整尺寸
        if (position.includes('e')) {
            newWidth = Math.max(250, startWidth + deltaX);
        }
        if (position.includes('w')) {
            newWidth = Math.max(250, startWidth - deltaX);
            newLeft = startLeft + deltaX;
        }
        if (position.includes('s')) {
            newHeight = Math.max(60, startHeight + deltaY);
        }
        if (position.includes('n')) {
            newHeight = Math.max(60, startHeight - deltaY);
            newTop = startTop + deltaY;
        }
        
        // 转换为百分比
        const widthPercent = (newWidth / containerRect.width) * 100;
        const heightPercent = (newHeight / containerRect.height) * 100;
        const leftPercent = (newLeft / containerRect.width) * 100;
        const topPercent = (newTop / containerRect.height) * 100;
        
        // 边界限制
        const finalWidth = Math.min(95, widthPercent);
        const finalHeight = Math.min(90, heightPercent);
        const finalLeft = Math.max(0, Math.min(95 - finalWidth, leftPercent));
        const finalTop = Math.max(0, Math.min(90 - finalHeight, topPercent));
        
        panel.style.width = `${finalWidth}%`;
        panel.style.height = `${finalHeight}%`;
        panel.style.left = `${finalLeft}%`;
        panel.style.top = `${finalTop}%`;
    };
    
    document.onmouseup = () => {
        if (!isDragging) return;
        
        // 恢复插件拖动
        delete panel.dataset.resizing;
        
        // 保存新的布局
        const pluginId = panel.dataset.plugin;
        STATE.plugins.layout[pluginId] = {
            x: parseFloat(panel.style.left),
            y: parseFloat(panel.style.top),
            width: parseFloat(panel.style.width),
            height: parseFloat(panel.style.height),
            minimized: STATE.plugins.layout[pluginId]?.minimized || false
        };
        
        saveToStorage();
        
        document.onmousemove = null;
        document.onmouseup = null;
    };
}

function applyPluginLayout(pluginId) {
    const panel = document.getElementById(`${pluginId}Plugin`);
    const layout = STATE.plugins.layout[pluginId] || PLUGINS[pluginId].defaultLayout;
    
    panel.style.left = `${layout.x}%`;
    panel.style.top = `${layout.y}%`;
    panel.style.width = `${layout.width}%`;
    panel.style.height = layout.minimized ? 'auto' : `${layout.height}%`;
    
    // 更新最小化状态
    if (layout.minimized) {
        panel.classList.add('minimized');
        panel.querySelector('.plugin-content')?.classList.add('hidden');
    } else {
        panel.classList.remove('minimized');
        panel.querySelector('.plugin-content')?.classList.remove('hidden');
    }
}

function toggleMinimize(pluginId) {
    const layout = STATE.plugins.layout[pluginId];
    if (layout) {
        layout.minimized = !layout.minimized;
        saveToStorage();
        applyPluginLayout(pluginId);
    }
}

function setupPluginDrag() {
    const panels = document.querySelectorAll('.plugin-panel');
    
    panels.forEach(panel => {
        const header = panel.querySelector('.plugin-header');
        if (!header) return;
        
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let dragElement = null;
        
        header.onmousedown = (e) => {
            // 如果正在调整大小，不允许拖动
            if (panel.dataset.resizing === 'true') return;
            
            if (e.target.classList.contains('plugin-close') || 
                e.target.classList.contains('plugin-minimize')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            dragElement = panel;
            
            const rect = panel.getBoundingClientRect();
            const container = document.getElementById('pluginsContainer').getBoundingClientRect();
            
            startLeft = rect.left - container.left;
            startTop = rect.top - container.top;
            
            panel.style.zIndex = 1000;
            panel.classList.add('dragging');
            
            // 创建拖拽时的半透明副本
            const ghost = panel.cloneNode(true);
            ghost.style.opacity = '0.5';
            ghost.style.position = 'fixed';
            ghost.style.pointerEvents = 'none';
            ghost.style.zIndex = 9999;
            ghost.id = 'dragGhost';
            document.body.appendChild(ghost);
            
            updateGhostPosition(ghost, rect);
        };
        
        document.onmousemove = (e) => {
            if (!isDragging || dragElement !== panel) return;
            
            const container = document.getElementById('pluginsContainer').getBoundingClientRect();
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            const newLeft = startLeft + deltaX;
            const newTop = startTop + deltaY;
            
            // 转换为百分比
            const leftPercent = (newLeft / container.width) * 100;
            const topPercent = (newTop / container.height) * 100;
            
            // 网格吸附 (每5%为一个网格)
            const snappedLeft = Math.round(leftPercent / 5) * 5;
            const snappedTop = Math.round(topPercent / 5) * 5;
            
            // 边界限制
            const finalLeft = Math.max(0, Math.min(95, snappedLeft));
            const finalTop = Math.max(0, Math.min(90, snappedTop));
            
            panel.style.left = `${finalLeft}%`;
            panel.style.top = `${finalTop}%`;
            
            // 更新ghost位置
            const ghost = document.getElementById('dragGhost');
            if (ghost) {
                const ghostRect = panel.getBoundingClientRect();
                updateGhostPosition(ghost, ghostRect);
            }
        };
        
        document.onmouseup = () => {
            if (!isDragging || dragElement !== panel) return;
            
            isDragging = false;
            panel.style.zIndex = 100;
            panel.classList.remove('dragging');
            
            // 移除ghost
            const ghost = document.getElementById('dragGhost');
            if (ghost) {
                ghost.remove();
            }
            
            // 检查碰撞并自动调整
            checkCollisionAndAdjust(panel);
            
            // 保存布局
            const pluginId = panel.dataset.plugin;
            STATE.plugins.layout[pluginId] = {
                x: parseFloat(panel.style.left),
                y: parseFloat(panel.style.top),
                width: parseFloat(panel.style.width),
                height: parseFloat(panel.style.height),
                minimized: STATE.plugins.layout[pluginId]?.minimized || false
            };
            
            saveToStorage();
        };
    });
}

function updateGhostPosition(ghost, rect) {
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
}

function checkCollisionAndAdjust(currentPanel) {
    const currentRect = currentPanel.getBoundingClientRect();
    const currentId = currentPanel.dataset.plugin;
    
    const panels = Array.from(document.querySelectorAll('.plugin-panel'))
        .filter(p => p.dataset.plugin !== currentId && p.style.display !== 'none');
    
    for (const panel of panels) {
        const rect = panel.getBoundingClientRect();
        
        // 检查碰撞
        if (isColliding(currentRect, rect)) {
            // 简单的碰撞响应：向右或向下移动
            const layout = STATE.plugins.layout[panel.dataset.plugin];
            if (layout) {
                // 尝试向右移动
                if (parseFloat(currentPanel.style.left) > parseFloat(panel.style.left)) {
                    layout.x = Math.min(95, layout.x + 5);
                } else {
                    // 尝试向下移动
                    layout.y = Math.min(90, layout.y + 5);
                }
                
                applyPluginLayout(panel.dataset.plugin);
            }
        }
    }
}

function isColliding(rect1, rect2) {
    return !(rect1.right < rect2.left || 
             rect1.left > rect2.right || 
             rect1.bottom < rect2.top || 
             rect1.top > rect2.bottom);
}

function resetPluginLayout() {
    if (!confirm('确定要重置所有插件布局吗？这将把插件恢复到默认位置。')) return;
    
    // 重置所有启用插件的布局
    STATE.plugins.enabled.forEach((pluginId, index) => {
        const defaultPositions = [
            { x: 2, y: 10, width: 30, height: 35 },
            { x: 2, y: 50, width: 30, height: 35 },
            { x: 35, y: 10, width: 60, height: 80 }
        ];
        
        const pos = defaultPositions[index % defaultPositions.length];
        STATE.plugins.layout[pluginId] = {
            ...pos,
            minimized: false
        };
    });
    
    saveToStorage();
    renderPlugins();
    showToast('插件布局已重置', 'success');
}

// ==================== 任务金字塔 ====================
function renderPyramid() {
    console.log('渲染任务金字塔...');
    
    // 按优先级分类任务
    const pyramidTasks = {
        high: STATE.tasks.filter(t => t.priority === 'high' && !t.completed),
        medium: STATE.tasks.filter(t => t.priority === 'medium' && !t.completed),
        low: STATE.tasks.filter(t => t.priority === 'low' && !t.completed)
    };
    
    // 渲染每个优先级
    renderPyramidLevel('high', pyramidTasks.high);
    renderPyramidLevel('medium', pyramidTasks.medium);
    renderPyramidLevel('low', pyramidTasks.low);
    
    // 更新计数
    document.getElementById('pyramid-high-count').textContent = pyramidTasks.high.length;
    document.getElementById('pyramid-medium-count').textContent = pyramidTasks.medium.length;
    document.getElementById('pyramid-low-count').textContent = pyramidTasks.low.length;
}

function renderPyramidLevel(level, tasks) {
    const container = document.getElementById(`pyramid-${level}-tasks`);
    if (!container) return;
    
    // 清空容器
    container.innerHTML = '';
    
    // 添加任务
    tasks.forEach(task => {
        const taskElement = createPyramidTaskElement(task);
        container.appendChild(taskElement);
    });
    
    // 如果没有任务，显示空状态
    if (tasks.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'pyramid-empty';
        emptyState.textContent = '暂无任务';
        emptyState.style.cssText = 'text-align: center; color: rgba(232, 234, 237, 0.4); padding: 20px;';
        container.appendChild(emptyState);
    }
}

function createPyramidTaskElement(task) {
    const taskElement = document.createElement('div');
    taskElement.className = `pyramid-task ${task.completed ? 'completed' : ''}`;
    taskElement.dataset.taskId = task.id;
    
    let metaHTML = '';
    if (task.duration) {
        metaHTML += `<span>⏱️ ${task.duration}</span>`;
    }
    if (task.deadline) {
        const deadlineText = formatDateDeadline(task.deadline);
        metaHTML += `<span>📅 ${deadlineText}</span>`;
    }
    
    taskElement.innerHTML = `
        <div class="pyramid-task-name">${task.name}</div>
        <div class="pyramid-task-meta">${metaHTML}</div>
        <div class="pyramid-task-actions">
            <button class="pyramid-task-btn complete" data-task-id="${task.id}" data-action="complete">✓</button>
            <button class="pyramid-task-btn delete" data-task-id="${task.id}" data-action="delete">×</button>
        </div>
    `;
    
    // 使用事件委托处理按钮点击
    taskElement.onclick = (e) => {
        const action = e.target.dataset.action;
        const taskId = e.target.dataset.taskId;
        
        if (action === 'complete') {
            completePyramidTask(taskId, e);
        } else if (action === 'delete') {
            deletePyramidTask(taskId, e);
        } else {
            toggleTask(task.id, e);
        }
    };
    
    return taskElement;
}

function completePyramidTask(taskId, event) {
    event.stopPropagation();
    const task = STATE.tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    
    task.completed = true;
    
    // 更新用户统计
    updateUserContext(true);
    
    saveToStorage();
    renderPyramid();
    renderTasks();
    updateStats();
    showToast('任务完成！🎉', 'success');
}

function deletePyramidTask(taskId, event) {
    event.stopPropagation();
    
    if (!confirm('确定要删除这个任务吗？')) return;
    
    STATE.tasks = STATE.tasks.filter(t => String(t.id) !== String(taskId));
    
    saveToStorage();
    renderPyramid();
    renderTasks();
    updateStats();
    showToast('任务已删除', 'info');
}

// ==================== 番茄钟功能 ====================
let tomatoInterval = null;

function startTomatoTimer() {
    if (STATE.tomatoTimer.isActive) return;
    
    STATE.tomatoTimer.isActive = true;
    saveToStorage();
    
    tomatoInterval = setInterval(() => {
        if (STATE.tomatoTimer.timeLeft > 0) {
            STATE.tomatoTimer.timeLeft--;
            updateTimerDisplay();
            saveToStorage();
        } else {
            // 时间到
            completeTomatoSession();
        }
    }, 1000);
    
    updateTimerStatus('运行中');
}

function pauseTomatoTimer() {
    if (!STATE.tomatoTimer.isActive) return;
    
    STATE.tomatoTimer.isActive = false;
    clearInterval(tomatoInterval);
    saveToStorage();
    
    updateTimerStatus('已暂停');
}

function resetTomatoTimer() {
    STATE.tomatoTimer.isActive = false;
    STATE.tomatoTimer.timeLeft = 25 * 60;
    STATE.tomatoTimer.mode = 'work';
    clearInterval(tomatoInterval);
    saveToStorage();
    
    updateTimerDisplay();
    updateTimerStatus('专注时间');
}

function resumeTomatoTimer() {
    if (STATE.tomatoTimer.isActive) {
        startTomatoTimer();
    }
    updateTimerDisplay();
    updateTimerStatus(STATE.tomatoTimer.isActive ? '运行中' : '已暂停');
}

function completeTomatoSession() {
    clearInterval(tomatoInterval);
    STATE.tomatoTimer.isActive = false;
    
    if (STATE.tomatoTimer.mode === 'work') {
        // 工作时间结束，开始休息
        STATE.tomatoTimer.mode = 'break';
        STATE.tomatoTimer.timeLeft = 5 * 60;
        showToast('专注完成！休息5分钟吧 🍅', 'success');
        updateTimerStatus('休息时间');
    } else {
        // 休息时间结束，开始新的工作
        STATE.tomatoTimer.mode = 'work';
        STATE.tomatoTimer.timeLeft = 25 * 60;
        showToast('休息结束！开始新的专注 🎯', 'success');
        updateTimerStatus('专注时间');
    }
    
    saveToStorage();
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const minutes = Math.floor(STATE.tomatoTimer.timeLeft / 60);
    const seconds = STATE.tomatoTimer.timeLeft % 60;
    const display = document.getElementById('timerDisplay');
    if (display) {
        display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function updateTimerStatus(status) {
    const statusEl = document.getElementById('timerStatus');
    if (statusEl) {
        statusEl.textContent = status;
    }
}

function renderTomatoTimer() {
    updateTimerDisplay();
    updateTimerStatus(STATE.tomatoTimer.isActive ? '运行中' : '已暂停');
}

// ==================== AI 优先级建议功能 ====================
async function suggestPriorityForTask(taskId) {
    if (!STATE.apiKey) {
        showToast('请先配置API密钥', 'info');
        openApiConfig();
        return;
    }
    
    const task = STATE.tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    
    showToast('AI正在分析任务优先级...', 'info');
    
    try {
        const prompt = `请分析以下任务的优先级和紧急程度，并给出建议：

任务名称：${task.name}
任务时长：${task.duration}

请按照以下JSON格式返回分析结果：
\`\`\`json
{
    "quadrant": "urgent_important|planned|delegate|eliminate",
    "reason": "分类理由",
    "suggestion": "具体建议"
}
\`\`\`

分类标准：
- urgent_important: 重要且紧急，立即做
- planned: 重要不紧急，计划做
- delegate: 紧急不重要，授权做
- eliminate: 不重要不紧急，断舍离`;

        const response = await callAI(prompt);
        
        if (response.text) {
            const jsonMatch = response.text.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[1]);
                
                // 显示AI建议
                if (analysis.suggestion) {
                    showToast(`AI建议：${analysis.suggestion}`, 'success');
                }
            }
        }
    } catch (error) {
        console.error('AI建议失败:', error);
        showToast('AI建议失败', 'error');
    }
}

optimizedRenderTasks = debounce(function() {
    const tasksArea = document.getElementById('tasksArea');
    if (!tasksArea) return;
    
    if (STATE.tasks.length === 0) {
        tasksArea.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🧘</div>
                <p>深呼吸，先从一个小任务开始...</p>
            </div>
        `;
        return;
    }
    
    // 使用文档片段减少DOM操作
    const fragment = document.createDocumentFragment();
    
    STATE.tasks.forEach(task => {
        // 跳过已降级的原任务（只显示降级后的任务）
        if (task.isReduced && !task.name.includes('（降级版）')) {
            return;
        }
        
        const taskCard = document.createElement('div');
        taskCard.className = `task-card ${task.completed ? 'completed' : ''}`;
        taskCard.setAttribute('data-task-id', task.id);
        
        const priorityClass = `priority-${task.priority}`;
        const priorityText = {
            high: '🔥 高优先级',
            medium: '⚡ 中优先级',
            low: '🌱 低优先级'
        }[task.priority];
        
        let taskHTML = `
            <div class="task-priority ${priorityClass}">${priorityText}</div>
            <div class="task-name">${task.name}</div>
        `;
        
        // 只在有明确时间信息时显示预计时间（排除默认的空值或通用值）
        if (task.duration && task.duration.trim() !== '' && !task.duration.includes('默认')) {
            taskHTML += `<div class="task-duration">⏱️ ${task.duration}</div>`;
        }
        
        // 显示DDL
        if (task.deadline) {
            const deadlineText = formatDateDeadline(task.deadline);
            const isUrgent = isDeadlineUrgent(task.deadline);
            const urgencyClass = isUrgent ? 'deadline-urgent' : 'deadline-normal';
            taskHTML += `<div class="task-deadline ${urgencyClass}">📅 ${deadlineText}</div>`;
        }
        
        // 添加DDL编辑按钮
        if (!task.completed) {
            taskHTML += `<button class="ddl-btn" data-task-id="${task.id}" title="修改截止时间">📅</button>`;
        }
        
        // 添加AI建议按钮（仅对未完成任务）
        if (!task.completed) {
            taskHTML += `<button class="ai-suggest-task-btn" data-task-id="${task.id}" title="AI建议优先级">🤖</button>`;
        }
        
        // 添加难度降级按钮（只在任务有降级建议且不是降级任务本身时显示）
        if (task.difficultyReduction && !task.completed && !task.name.includes('（降级版）')) {
            taskHTML += `<button class="difficulty-btn" data-task-id="${task.id}" title="降低难度">📉 降级</button>`;
        }
        
        taskHTML += `<button class="delete-btn" data-task-id="${task.id}" title="删除任务">删除</button>`;
        
        taskCard.innerHTML = taskHTML;
        
        // 点击卡片切换完成状态
        taskCard.onclick = (e) => {
            // 处理DDL编辑按钮点击
            if (e.target.classList.contains('ddl-btn')) {
                const taskId = e.target.dataset.taskId;
                if (taskId) {
                    editTaskDeadline(taskId, e);
                }
                return;
            }
            
            // 处理降级按钮点击
            if (e.target.classList.contains('difficulty-btn')) {
                const taskId = e.target.dataset.taskId;
                if (taskId) {
                    reduceDifficulty(taskId, e);
                }
                return;
            }
            
            // 处理删除按钮点击
            if (e.target.classList.contains('delete-btn')) {
                const taskId = e.target.dataset.taskId;
                if (taskId) {
                    deleteTask(taskId, e);
                }
                return;
            }
            
            // 处理AI建议按钮点击
            if (e.target.classList.contains('ai-suggest-task-btn')) {
                const taskId = e.target.dataset.taskId;
                if (taskId) {
                    suggestPriorityForTask(taskId, e);
                }
                return;
            }
            
            // 点击卡片其他区域切换完成状态
            toggleTask(task.id, e);
        };
        
        // 添加拖拽功能
        taskCard.draggable = true;
        
        // 使用addEventListener绑定拖拽事件
        taskCard.addEventListener('dragstart', (e) => handleDragStart(e, task.id));
        taskCard.addEventListener('dragover', (e) => handleDragOver(e));
        taskCard.addEventListener('drop', (e) => handleDrop(e, task.id));
        
        fragment.appendChild(taskCard);
    });
    
    tasksArea.innerHTML = '';
    tasksArea.appendChild(fragment);
}, 50); // 50ms防抖

function onProviderChange() {
    const providerId = document.getElementById('providerSelect')?.value || STATE.aiProvider;
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.openrouter;
    const providerHelp = document.getElementById('providerHelp');
    const apiKeyInput = document.getElementById('apiKeyInput');

    if (providerHelp) {
        if (providerId === 'openrouter') {
            providerHelp.innerHTML = `
                <p><strong>如何获取 OpenRouter API 密钥：</strong></p>
                <ol>
                    <li>访问 <a href="https://openrouter.ai/" target="_blank">https://openrouter.ai/</a></li>
                    <li>注册并进入 Keys 页面</li>
                    <li>创建 API Key（通常以 <code>sk-or-</code> 开头）</li>
                    <li>模型可使用 <code>openrouter/free</code>（免费路由）</li>
                </ol>
                <p class="free-notice">✅ 推荐：OpenRouter Free Router，适合免费试用</p>
            `;
        } else {
            providerHelp.innerHTML = `
                <p><strong>如何获取 DeepSeek API 密钥：</strong></p>
                <ol>
                    <li>访问 <a href="https://platform.deepseek.com/" target="_blank">https://platform.deepseek.com/</a></li>
                    <li>注册或登录账号</li>
                    <li>进入"API Keys"页面</li>
                    <li>点击"创建API密钥"</li>
                    <li>复制API密钥到下方输入框</li>
                </ol>
                <p class="free-notice">✅ 新用户有免费额度，中文支持优秀</p>
            `;
        }
    }

    if (apiKeyInput) {
        apiKeyInput.placeholder = `请输入你的${provider.name} API密钥`;
    }
}
function renderFrogTask() {
    const content = document.getElementById('frogContent');
    if (!content) return;
    
    if (!STATE.frogTask) {
        content.innerHTML = `
            <div class="empty-frog">
                <div class="empty-frog-icon">🐸</div>
                <p>还没有青蛙任务</p>
                <button class="ai-suggest-btn" onclick="suggestFrogTask()">AI建议</button>
            </div>
        `;
        return;
    }
    
    content.innerHTML = `
        <div class="frog-task-card">
            <div class="frog-task-name">${STATE.frogTask.name}</div>
            <div class="frog-task-desc">${STATE.frogTask.description || ''}</div>
            <div class="frog-task-actions">
                <button class="frog-action-btn" onclick="completeFrogTask()">吃掉这只青蛙 🐸</button>
                <button class="frog-action-btn" onclick="clearFrogTask()">换一只青蛙</button>
            </div>
        </div>
    `;
}

async function suggestFrogTask() {
    if (!STATE.apiKey) {
        showToast('请先配置API密钥', 'info');
        openApiConfig();
        return;
    }
    
    showToast('AI正在分析你的任务...', 'info');
    
    try {
        const incompleteTasks = STATE.tasks.filter(t => !t.completed);
        if (incompleteTasks.length === 0) {
            showToast('没有可分析的任务', 'info');
            return;
        }
        
        const tasks = incompleteTasks.map(t => t.name);
        console.log('可分析的任务:', tasks);
        
        const prompt = `从以下任务中找出最困难、最重要、最需要优先完成的任务（"青蛙"任务）：
${tasks.join('\n')}

请只返回任务名称，不要其他内容，不要加任何解释。`;

        console.log('发送AI请求:', prompt);
        const response = await callAI(prompt);
        console.log('AI响应:', response);
        
        if (response.text) {
            // 清理AI返回的文本，移除引号、换行符等
            let frogTaskName = response.text.trim();
            frogTaskName = frogTaskName.replace(/^["']|["']$/g, ''); // 移除首尾引号
            frogTaskName = frogTaskName.replace(/["']/g, ''); // 移除所有引号
            frogTaskName = frogTaskName.replace(/\n/g, ''); // 移除换行符
            frogTaskName = frogTaskName.replace(/（青蛙任务）.*/, ''); // 移除可能的注释
            
            console.log('清理后的任务名称:', frogTaskName);
            
            // 尝试精确匹配
            let frogTask = incompleteTasks.find(t => t.name === frogTaskName);
            
            // 如果精确匹配失败，尝试模糊匹配
            if (!frogTask) {
                frogTask = incompleteTasks.find(t => 
                    t.name.includes(frogTaskName) || frogTaskName.includes(t.name)
                );
                console.log('使用模糊匹配:', frogTask ? frogTask.name : '未找到');
            }
            
            if (frogTask) {
                STATE.frogTask = {
                    id: frogTask.id,
                    name: frogTask.name,
                    description: frogTask.difficultyReduction || '这是今天最重要的任务'
                };
                saveToStorage();
                renderFrogTask();
                showToast('AI建议的青蛙任务：' + frogTask.name, 'success');
            } else {
                console.error('无法找到匹配的任务:', frogTaskName);
                showToast('AI建议的任务未找到，请手动选择', 'warning');
            }
        } else {
            console.error('AI响应为空');
            showToast('AI没有返回有效建议', 'warning');
        }
    } catch (error) {
        console.error('AI建议失败:', error);
        showToast('AI建议失败: ' + error.message, 'error');
    }
}

function completeFrogTask() {
    if (!STATE.frogTask) return;
    
    // 标记原任务为完成
    const task = STATE.tasks.find(t => t.id === STATE.frogTask.id);
    if (task) {
        task.completed = true;
        updateUserContext(true);
    }
    
    showToast('🐸 青蛙吃掉了！太棒了！', 'success');
    STATE.frogTask = null;
    
    saveToStorage();
    renderFrogTask();
    renderTasks();
    updateStats();
}

function clearFrogTask() {
    STATE.frogTask = null;
    saveToStorage();
    renderFrogTask();
    showToast('青蛙任务已清除', 'info');
}

// ==================== 网站介绍弹窗 ====================
function checkShowIntro() {
    const introShown = localStorage.getItem(STORAGE_KEYS.INTRO_SHOWN);
    if (!introShown) {
        setTimeout(() => {
            showIntroModal();
        }, 500);
    }
}

function showIntroModal() {
    const modal = document.getElementById('introModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeIntroModal() {
    const modal = document.getElementById('introModal');
    const dontShowAgain = document.getElementById('dontShowAgain');
    
    if (dontShowAgain && dontShowAgain.checked) {
        localStorage.setItem(STORAGE_KEYS.INTRO_SHOWN, 'true');
    }
    
    if (modal) {
        modal.classList.remove('active');
    }
}

function startApp() {
    closeIntroModal();
    showToast('欢迎使用心语计划！', 'success');
}

// 重新显示介绍弹窗（用于调试）
window.showIntroAgain = function() {
    localStorage.removeItem(STORAGE_KEYS.INTRO_SHOWN);
    showIntroModal();
    console.log('✅ 介绍弹窗将再次显示');
};