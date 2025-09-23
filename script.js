
// Конфигурация приложения - ЗАМЕНИТЕ НА РЕАЛЬНЫЕ АДРЕСА
const CONFIG = {
    API_BASE_URL: 'https://api.your-real-company.com',
    API_1C_BASE_URL: 'https://your-real-1c-server.com/hs'
};

// Глобальные переменные
let tg = null;
let userData = null;
let currentTaskId = null;
let isOnline = true;

// Демо-данные (можно заменить на загрузку из API)
const tasksData = [
  {
    type: "event",
    id: "EV-001",
    title: "Установка ККТ",
    status: "in-progress"
  },
  {
    type: "task",
    id: "T-201",
    title: "Установка и настройка ККТ",
    status: "in-progress",
    parentId: "EV-001"
  },
  {
    type: "service",
    id: "S-101",
    title: "Техническое обслуживание ККТ",
    status: "new",
    parentId: "EV-001"
  },
  {
    type: "event",
    id: "EV-002",
    title: "Обслуживание ГСМ выполнено",
    status: "completed"
  },
  {
    type: "task",
    id: "T-202",
    title: "Сверка ГСМ с АЗС",
    status: "completed",
    parentId: "EV-002"
  },
  {
    type: "service",
    id: "S-102",
    title: "Плановое обслуживание ГСМ",
    status: "new",
    parentId: "EV-002"
  },
  {
    type: "event",
    id: "EV-003",
    title: "Настройка системы",
    status: "postponed"
  },
  {
    type: "task",
    id: "T-203",
    title: "Обработка ошибок ДО",
    status: "postponed",
    parentId: "EV-003"
  },
  {
    type: "service",
    id: "S-103",
    title: "Аварийное обслуживание",
    status: "new",
    parentId: "EV-003"
  },
  {
    type: "event",
    id: "EV-004",
    title: "Проведение инвентаризации",
    status: "new"
  },
  {
    type: "task",
    id: "T-204",
    title: "Подсчет товарных остатков",
    status: "new",
    parentId: "EV-004"
  },
  {
    type: "service",
    id: "S-104",
    title: "Проверка оборудования",
    status: "new",
    parentId: "EV-004"
  }
];

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация Telegram Web App
    if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
        tg = Telegram.WebApp;
        tg.expand();
        tg.enableClosingConfirmation();
        autoAuth();
        setupTheme();
    } else {
        console.warn('Telegram Web App не обнаружен. Запуск в режиме браузера.');
        tg = {
            initData: 'query_id=test&user=%7B%22id%22%3A12345%7D',
            colorScheme: 'light',
            setHeaderColor: () => {},
            expand: () => {},
            enableClosingConfirmation: () => {},
            showPopup: null
        };
        simulateTelegramAuth();
    }

    checkConnection();
    setupEventListeners();
    initializeFilters();

    // 👇 Рендерим задачи по новой структуре
    renderTasksByEvents();
});

// 👇 Функция рендеринга по событиям
function renderTasksByEvents() {
    const eventsContainer = document.querySelector('.events-container');
    if (!eventsContainer) return;

    // Очищаем
    eventsContainer.innerHTML = '';

    // Группируем по событиям
    const eventMap = {};
    tasksData.forEach(item => {
        if (item.type === "event") {
            eventMap[item.id] = { ...item, children: [] };
        } else {
            if (eventMap[item.parentId]) {
                eventMap[item.parentId].children.push(item);
            }
        }
    });

    // Рендерим
    Object.values(eventMap).forEach(event => {
        const group = document.createElement("div");
        group.className = "event-group";

        const header = document.createElement("div");
        header.className = "event-header";
        header.innerHTML = `
            <span class="event-icon">📁</span>
            <span class="event-title">${event.title}</span>
            <span class="event-status status-${event.status}">${getStatusText(event.status)}</span>
        `;
        group.appendChild(header);

        event.children.forEach(child => {
            const item = document.createElement("div");
            item.className = child.type === "task" ? "task-item" : "service-item";
            item.dataset.status = child.status;
            item.dataset.id = child.id;
            item.onclick = () => openTaskDetail(child.id);

            let icon = child.type === "task" ? "✅" : "⚙️";
            let idPrefix = child.type === "task" ? "Задача#" : "Обслуживание#";
            let statusClass = `status-${child.status}`;

            item.innerHTML = `
                <span class="task-icon">${icon}</span>
                <span class="task-id">${idPrefix}${child.id}</span>
                <span class="task-title">${child.title}</span>
                <span class="task-status ${statusClass}">${getStatusText(child.status)}</span>
            `;
            group.appendChild(item);
        });

        eventsContainer.appendChild(group);
    });
}

// Получение текста статуса
function getStatusText(status) {
    switch (status) {
        case "in-progress": return "в работе";
        case "completed": return "выполнено";
        case "postponed": return "отложено";
        case "new": return "новое";
        default: return "";
    }
}

// Проверка соединения
function checkConnection() {
    isOnline = navigator.onLine;
    updateConnectionStatus();
    
    window.addEventListener('online', () => {
        isOnline = true;
        updateConnectionStatus();
        showSuccess('Соединение восстановлено');
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        updateConnectionStatus();
        showError('Отсутствует интернет-соединение');
    });
}

// Обновление статуса соединения
function updateConnectionStatus() {
    const statusElement = document.querySelector('.connection-status');
    if (statusElement) {
        statusElement.textContent = `Подключено к 1СПредприятие (кв.3.20) ${isOnline ? '' : ' [ОФФЛАЙН]'}`;
        statusElement.style.color = isOnline ? '#666' : '#ff6b6b';
    }
}

// Автоматическая авторизация
async function autoAuth() {
    try {
        const token = getTokenFromURL();
        if (token) {
            const response = await fetch(`${CONFIG.API_BASE_URL}/auth/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                userData = { guid: data.user_guid, role: data.role };
                console.log('Авторизация успешна:', userData);
            } else {
                throw new Error('Ошибка авторизации');
            }
        } else {
            simulateTelegramAuth();
        }
    } catch (error) {
        console.error('Ошибка авторизации:', error);
        simulateTelegramAuth();
        showError('Режим тестирования: используются демо-данные');
    }
}

// Получение токена из URL
function getTokenFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token');
}

// Настройка темы
function setupTheme() {
    const theme = localStorage.getItem('theme') || 'auto';
    if (theme === 'auto' && tg) {
        applyTheme(tg.colorScheme);
        tg.onEvent('themeChanged', () => applyTheme(tg.colorScheme));
    } else {
        applyTheme(theme);
    }
}

// Применение темы
function applyTheme(theme) {
    if (theme === 'dark' || (theme === 'auto' && tg && tg.colorScheme === 'dark')) {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (tg) tg.setHeaderColor('#1e1e1e');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        if (tg) tg.setHeaderColor('#2481cc');
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });

    document.getElementById('status-filter').addEventListener('change', filterTasks);
    document.getElementById('date-filter').addEventListener('change', filterTasks);

    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('download-btn')) {
            const documentId = e.target.getAttribute('data-document-id');
            if (documentId) downloadDocument(documentId);
        }
    });
}

// Инициализация фильтров
function initializeFilters() {
    filterTasks();
}

// Переключение вкладок
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// Фильтрация задач (обновлённая под новую структуру)
function filterTasks() {
    const statusFilter = document.getElementById('status-filter').value;
    const dateFilter = document.getElementById('date-filter').value; // пока не используется

    document.querySelectorAll('.task-item, .service-item').forEach(item => {
        const itemStatus = item.dataset.status;
        if (statusFilter === 'all' || itemStatus === statusFilter) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Открытие деталей задачи
function openTaskDetail(taskId) {
    currentTaskId = taskId;
    document.getElementById('detail-task-id')?.textContent && (document.getElementById('detail-task-id').textContent = taskId);
    document.getElementById('detail-confirm-id')?.textContent && (document.getElementById('detail-confirm-id').textContent = `#${taskId}`);
    showScreen('task-detail-screen');
}

// Показ экрана
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');
}

// Подтверждение задачи
async function confirmTask() {
    if (!isOnline) {
        showError('Нет подключения к интернету. Действие недоступно.');
        return;
    }

    const confirmationType = document.querySelector('input[name="confirmation"]:checked');
    const comment = document.querySelector('.comment-input')?.value;

    if (!confirmationType) {
        showError('Пожалуйста, выберите тип подтверждения');
        return;
    }

    try {
        await simulateApiRequest();
        showSuccess('Задача успешно подтверждена');
        showScreen('main-screen');
        updateTaskStatus(currentTaskId, confirmationType.value);
    } catch (error) {
        console.error('Ошибка подтверждения задачи:', error);
        showError('Ошибка подтверждения задачи');
    }
}

// Имитация API запроса
function simulateApiRequest() {
    return new Promise(resolve => setTimeout(() => resolve({ Status: 'Success' }), 1000));
}

// Обновление статуса задачи (обновлённая под новую структуру)
function updateTaskStatus(taskId, status) {
    const taskItem = document.querySelector(`[data-id="${taskId}"]`);
    if (taskItem) {
        const statusElement = taskItem.querySelector('.task-status');
        statusElement.classList.remove('status-in-progress', 'status-completed', 'status-postponed', 'status-new');

        let newStatusClass = '';
        let newStatusText = '';

        switch (status) {
            case 'completed':
                newStatusClass = 'status-completed';
                newStatusText = 'выполнено';
                break;
            case 'partial':
                newStatusClass = 'status-in-progress';
                newStatusText = 'частично';
                break;
            case 'postponed':
                newStatusClass = 'status-postponed';
                newStatusText = 'отложено';
                break;
            default:
                newStatusClass = 'status-new';
                newStatusText = 'новое';
        }

        statusElement.classList.add(newStatusClass);
        statusElement.textContent = newStatusText;
        taskItem.dataset.status = status === 'completed' ? 'completed' : status === 'partial' ? 'in-progress' : status === 'postponed' ? 'postponed' : 'new';
    }
}

// Генерация PDF
async function generateTaskPDF() {
    if (!isOnline) {
        showError('Нет подключения к интернету. Действие недоступно.');
        return;
    }

    try {
        await generateDemoPDF(currentTaskId);
        showSuccess('PDF успешно сгенерирован и скачан');
    } catch (error) {
        console.error('Ошибка генерации PDF:', error);
        showError('Ошибка генерации PDF');
    }
}

// Генерация демо-PDF
function generateDemoPDF(taskId) {
    return new Promise(resolve => {
        const content = `Задача: ${taskId}\nДата: ${new Date().toLocaleDateString()}\nСтатус: В работе`;
        const blob = new Blob([content], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `task_${taskId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
    });
}

// Скачивание документа
async function downloadDocument(documentId) {
    if (!isOnline) {
        showError('Нет подключения к интернету. Действие недоступно.');
        return;
    }

    try {
        await generateDemoDocument(documentId);
        showSuccess('Документ успешно скачан');
    } catch (error) {
        console.error('Ошибка загрузки документа:', error);
        showError('Ошибка загрузки документа. Проверьте подключение к интернету.');
    }
}

// Генерация демо-документа
function generateDemoDocument(documentId) {
    return new Promise(resolve => {
        const documentNames = {
            'report_dec_2023': 'Отчет за декабрь 2023.pdf',
            'contract_supplier': 'Договор с поставщиком.pdf',
            'financial_plan_q1': 'Финансовый план Q1 2024.pdf',
            'invoice_12345': 'Счет на оплату №12345.pdf',
            'act_completed': 'Акт выполненных работ.pdf'
        };

        const content = `Документ: ${documentNames[documentId] || documentId}\nДата создания: ${new Date().toLocaleDateString()}`;
        const blob = new Blob([content], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = documentNames[documentId] || `document_${documentId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
    });
}

// Переключение секции комментария
function toggleCommentSection() {
    const commentSection = document.querySelector('.comment-section');
    if (commentSection) commentSection.classList.toggle('hidden');
}

// Показ ошибки
function showError(message) {
    console.error('Ошибка:', message);
    const notification = document.createElement('div');
    notification.className = 'custom-notification error';
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">⚠️</span>
            <span class="notification-text">${message}</span>
        </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.parentNode && notification.parentNode.removeChild(notification), 300);
    }, 5000);
}

// Показ успешного сообщения
function showSuccess(message) {
    console.log('Успех:', message);
    const notification = document.createElement('div');
    notification.className = 'custom-notification success';
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">✅</span>
            <span class="notification-text">${message}</span>
        </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.parentNode && notification.parentNode.removeChild(notification), 300);
    }, 3000);
}

// Эмуляция авторизации
function simulateTelegramAuth() {
    userData = { guid: 'test-guid-12345', role: 'user' };
    console.log('Тестовая авторизация успешна:', userData);
}