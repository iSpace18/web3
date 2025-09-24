const CACHE_NAME = 'telegram-web-app-v1';
const API_CACHE_NAME = 'telegram-web-app-api-v1';

// Файлы для кэширования
const STATIC_CACHE_URLS = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js'
];

// Установка Service Worker
self.addEventListener('install', event => {
    console.log('Service Worker: Установка');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Кэширование статических файлов');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => self.skipWaiting())
    );
});

// Активация Service Worker
self.addEventListener('activate', event => {
    console.log('Service Worker: Активация');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        console.log('Service Worker: Удаление старого кэша', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Обработка запросов
self.addEventListener('fetch', event => {
    // Пропускаем запросы к Telegram API и не-GET запросы
    if (!event.request.url.includes(self.location.origin) || 
        event.request.method !== 'GET') {
        return;
    }
    
    // Стратегия кэширования: Сначала сеть, потом кэш
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Клонируем ответ, так как он может быть использован только один раз
                const responseClone = response.clone();
                
                // Кэшируем успешные ответы от API
                if (event.request.url.includes('/odata/') || 
                    event.request.url.includes('/web-service/')) {
                    caches.open(API_CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseClone);
                        });
                }
                
                return response;
            })
            .catch(() => {
                // Если сеть недоступна, пытаемся получить из кэша
                return caches.match(event.request)
                    .then(cachedResponse => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        // Для API запросов возвращаем стандартный ответ об ошибке
                        if (event.request.url.includes('/odata/') || 
                            event.request.url.includes('/web-service/')) {
                            return new Response(JSON.stringify({
                                error: 'Нет подключения к интернету',
                                cached: true
                            }), {
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }
                    });
            })
    );
});

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
          showPopup: () => {} // Исправлено: добавлена функция
      };
      simulateTelegramAuth();
  }

  checkConnection();
  setupEventListeners();
  initializeFilters();

  // Рендерим задачи по новой структуре
  renderTasksByEvents();
});

// Функция рендеринга по событиям
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
      // Исправлено: проверка существования метода
      if (tg.onEvent) {
          tg.onEvent('themeChanged', () => applyTheme(tg.colorScheme));
      }
  } else {
      applyTheme(theme);
  }
}

// В функции applyTheme закомментируйте проблемные вызовы
function applyTheme(theme) {
    if (theme === 'dark' || (theme === 'auto' && tg && tg.colorScheme === 'dark')) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

// В инициализации уберите enableClosingConfirmation если не поддерживается
if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
    tg = Telegram.WebApp;
    tg.expand();
    // tg.enableClosingConfirmation(); // Закомментируйте эту строку
    autoAuth();
    setupTheme();
}

// Настройка обработчиков событий
function setupEventListeners() {
  document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', function() {
          switchTab(this.dataset.tab);
      });
  });

  const statusFilter = document.getElementById('status-filter');
  const dateFilter = document.getElementById('date-filter');
  
  if (statusFilter) statusFilter.addEventListener('change', filterTasks);
  if (dateFilter) dateFilter.addEventListener('change', filterTasks);

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
  const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (activeTab) activeTab.classList.add('active');
  
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  const activeContent = document.getElementById(`${tabName}-tab`);
  if (activeContent) activeContent.classList.add('active');
  
  // Загружаем новости при переключении на вкладку новостей
  if (tabName === 'news' && window.newsData && window.newsData.length === 0) {
      loadNews();
  }
}

// Фильтрация задач
function filterTasks() {
  const statusFilter = document.getElementById('status-filter');
  if (!statusFilter) return;
  
  const statusValue = statusFilter.value;

  document.querySelectorAll('.task-item, .service-item').forEach(item => {
      const itemStatus = item.dataset.status;
      if (statusValue === 'all' || itemStatus === statusValue) {
          item.style.display = 'flex';
      } else {
          item.style.display = 'none';
      }
  });
}

// Открытие деталей задачи
function openTaskDetail(taskId) {
  currentTaskId = taskId;
  const taskIdElement = document.getElementById('detail-task-id');
  const confirmIdElement = document.getElementById('detail-confirm-id');
  
  if (taskIdElement) taskIdElement.textContent = taskId;
  if (confirmIdElement) confirmIdElement.textContent = `#${taskId}`;
  
  showScreen('task-detail-screen');
}

// Показ экрана
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  const screenElement = document.getElementById(screenId);
  if (screenElement) screenElement.classList.add('active');
}

// Подтверждение задачи
async function confirmTask() {
  if (!isOnline) {
      showError('Нет подключения к интернету. Действие недоступно.');
      return;
  }

  const confirmationType = document.querySelector('input[name="confirmation"]:checked');
  const commentInput = document.querySelector('.comment-input');
  const comment = commentInput ? commentInput.value : '';

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

// Обновление статуса задачи
function updateTaskStatus(taskId, status) {
  const taskItem = document.querySelector(`[data-id="${taskId}"]`);
  if (taskItem) {
      const statusElement = taskItem.querySelector('.task-status');
      if (!statusElement) return;
      
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
      setTimeout(() => {
          if (notification.parentNode) {
              notification.parentNode.removeChild(notification);
          }
      }, 300);
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
      setTimeout(() => {
          if (notification.parentNode) {
              notification.parentNode.removeChild(notification);
          }
      }, 300);
  }, 3000);
}

// Эмуляция авторизации
function simulateTelegramAuth() {
  userData = { guid: 'test-guid-12345', role: 'user' };
  console.log('Тестовая авторизация успешна:', userData);
}
// JavaScript для новостей — переработанный (анимации, tilt, красивые статические изображения)
/* === Сохраняем PROXIES и основную логику запроса === */
const PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest='
];

let currentProxyIndex = 0;
let currentSlide = 0;
let totalSlides = 0;
let newsData = [];

const AUTO_SCROLL_DELAY = 5000;
let autoScrollInterval = null;
let isTabFocused = true;

/* ===================== ЗАГРУЗКА НОВОСТЕЙ ===================== */
async function loadNews() {
    const container = document.getElementById('carousel-container');
    const counter = document.getElementById('news-counter');

    if (!container) return;

    container.innerHTML = '<div class="loading">⏳ Загружаем новости...</div>';
    if (counter) counter.textContent = 'Загрузка...';

    try {
        const news = await fetchNewsWithProxy();
        newsData = news;

        if (newsData.length === 0) {
            throw new Error('Новости не найдены');
        }

    } catch (error) {
        console.error('Ошибка загрузки новостей:', error);
        container.innerHTML = `<div class="error">❌ Ошибка загрузки новостей: ${error.message}</div>`;
        if (counter) counter.textContent = 'Ошибка загрузки';
        return;
    }

    totalSlides = newsData.length;
    currentSlide = 0;

    if (counter) counter.textContent = `Новостей: ${newsData.length}`;
    renderCarousel();
}

/* ===================== ПРОКСИ-ФЕТЧ ===================== */
async function fetchNewsWithProxy() {
    const url = 'https://www.it-sochi.ru/news/';

    for (let i = 0; i < PROXIES.length; i++) {
        try {
            const proxyUrl = PROXIES[currentProxyIndex] + encodeURIComponent(url);
            console.log(`Пробуем прокси: ${PROXIES[currentProxyIndex]}`);

            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            const news = parseNewsFromHTML(html);

            if (news.length > 0) {
                console.log(`Успешно загружено ${news.length} новостей через прокси ${currentProxyIndex}`);
                return news;
            }

        } catch (error) {
            console.log(`Прокси ${currentProxyIndex} не сработал:`, error.message);
        }

        currentProxyIndex = (currentProxyIndex + 1) % PROXIES.length;
    }

    throw new Error('Все прокси серверы недоступны');
}

/* ===================== ПАРСИНГ (без изменений, только логирование осталось) ===================== */
function parseNewsFromHTML(html) {
    const news = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    console.log('Начинаем парсинг HTML...');

    const newsSelectors = [
        'article',
        '.news-item',
        '.news-list-item',
        '.post-item',
        '.entry',
        '.news-block',
        '.item-news',
        '[class*="news"] > div',
        '.content-item'
    ];

    let newsElements = [];

    for (const selector of newsSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 2) {
            newsElements = Array.from(elements);
            console.log(`Найдено ${elements.length} элементов по селектору: ${selector}`);
            break;
        }
    }

    if (newsElements.length === 0) {
        console.log('Пробуем поиск по структуре...');
        const containers = doc.querySelectorAll('div, article, section');
        newsElements = Array.from(containers).filter(el => {
            const text = el.textContent || '';
            const hasTitle = el.querySelector('h2, h3, h4');
            const hasLink = el.querySelector('a[href*="/news/"]');
            const hasImage = el.querySelector('img');

            return text.length > 100 && text.length < 2000 &&
                (hasTitle || hasLink) &&
                hasImage;
        });

        console.log(`Найдено по структуре: ${newsElements.length}`);
    }

    if (newsElements.length === 0) {
        console.log('Пробуем поиск по ссылкам...');
        const newsLinks = doc.querySelectorAll('a[href*="/news/"]');
        const uniqueUrls = new Set();

        newsLinks.forEach(link => {
            const href = link.href;
            if (href && href.includes('/news/') && !href.endsWith('/news/') && !uniqueUrls.has(href)) {
                uniqueUrls.add(href);

                let container = link.closest('div, article, li');
                if (container) {
                    newsElements.push(container);
                }
            }
        });

        console.log(`Найдено по ссылкам: ${newsElements.length}`);
    }

    newsElements.forEach((element, index) => {
        try {
            console.log(`Обрабатываем новость ${index + 1}...`);

            let title = '';
            const titleSelectors = ['h2', 'h3', 'h4', '.title', '.news-title', '.entry-title', '.post-title'];

            for (const selector of titleSelectors) {
                const titleEl = element.querySelector(selector);
                if (titleEl && titleEl.textContent.trim()) {
                    title = titleEl.textContent.trim();
                    break;
                }
            }

            if (!title) {
                const linkEl = element.querySelector('a');
                if (linkEl && linkEl.textContent.trim().length > 10) {
                    title = linkEl.textContent.trim();
                }
            }

            if (!title || title.length < 5) {
                console.log('Пропускаем - нет заголовка');
                return;
            }

            if (title.length > 100) title = title.substring(0, 100) + '...';

            let link = '';
            const linkEl = element.querySelector('a[href*="/news/"]');
            if (linkEl && linkEl.href) {
                link = linkEl.href;
                if (!link.startsWith('http')) {
                    link = 'https://www.it-sochi.ru' + (link.startsWith('/') ? link : '/' + link);
                }
            } else {
                link = `https://www.it-sochi.ru/news/`;
            }

            let description = '';
            const descSelectors = ['.excerpt', '.summary', '.description', '.news-desc', '.entry-content', '.post-content'];

            for (const selector of descSelectors) {
                const descEl = element.querySelector(selector);
                if (descEl && descEl.textContent.trim()) {
                    description = descEl.textContent.trim();
                    break;
                }
            }

            if (!description) {
                const firstP = element.querySelector('p');
                if (firstP && firstP.textContent.trim().length > 20) {
                    description = firstP.textContent.trim();
                }
            }

            if (description.length > 150) description = description.substring(0, 150) + '...';

            let image = '';
            const imgEl = element.querySelector('img');
            if (imgEl && imgEl.src) {
                image = imgEl.src;
                if (!image.startsWith('http')) {
                    image = 'https://www.it-sochi.ru' + (image.startsWith('/') ? image : '/' + image);
                }
            }

            let date = '';
            const dateSelectors = ['.date', '.post-date', '.news-date', '.published', 'time', '.meta'];

            for (const selector of dateSelectors) {
                const dateEl = element.querySelector(selector);
                if (dateEl && dateEl.textContent.trim()) {
                    date = dateEl.textContent.trim();
                    date = date.replace(/[^\d\sа-яё\-:.,]/gi, '').trim();
                    break;
                }
            }

            const isDuplicate = news.some(item => item.title === title || item.link === link);
            if (isDuplicate) {
                console.log('Пропускаем дубликат:', title);
                return;
            }

            news.push({
                title,
                link,
                description: description || 'Читать подробнее на сайте IT-Sochi...',
                image: image || getStaticPlaceholderImage(title, index),
                date: date || 'Недавно'
            });

            console.log(`Добавлена новость: ${title}`);

        } catch (e) {
            console.error(`Ошибка обработки новости ${index + 1}:`, e);
        }
    });

    const uniqueNews = news.filter((item, index, self) =>
        index === self.findIndex(t => t.link === item.link)
    );

    console.log(`Всего уникальных новостей: ${uniqueNews.length}`);
    return uniqueNews.slice(0, 10);
}

/* ===================== СТАТИЧНЫЕ КРАСИВЫЕ ИЗОБРАЖЕНИЯ (ГРАДИЕНТЫ, БЕЗ ТЕКСТА) ===================== */
/**
 * Возвращает data:image/svg+xml;base64 строку с градиентным прямоугольником.
 * Без текста, статично — выглядит "бомбово" и быстро грузится.
 * Используем индекс/текст чтобы генерировать разнообразные палитры.
 */
function getStaticPlaceholderImage(seedText = '', index = 0) {
    // Простая хэш-функция чтобы генерировать разные цвета на основе seed/index
    function hashToInt(s) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h;
    }
    const h = hashToInt((seedText || '') + index);
    // Генерируем 3 цвета из хеша
    function colorFromHash(offset) {
        const r = (h >> (offset * 8)) & 0xff;
        const g = (h >> ((offset + 1) * 5)) & 0xff;
        const b = (h >> ((offset + 2) * 3)) & 0xff;
        return `rgb(${r},${g},${b})`;
    }

    const c1 = colorFromHash(0);
    const c2 = colorFromHash(1);
    const c3 = colorFromHash(2);

    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='675' viewBox='0 0 1200 675'>
        <defs>
            <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
                <stop offset='0%' stop-color='${c1}'/>
                <stop offset='50%' stop-color='${c2}'/>
                <stop offset='100%' stop-color='${c3}'/>
            </linearGradient>
            <filter id='grain'>
                <feTurbulence baseFrequency='0.8' numOctaves='2' stitchTiles='stitch' result='t'/>
                <feColorMatrix type='saturate' values='0'/>
                <feBlend in='SourceGraphic' in2='t' mode='overlay'/>
            </filter>
        </defs>
        <rect width='100%' height='100%' fill='url(#g)' />
        <rect width='100%' height='100%' fill='black' opacity='0.02' />
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/* ===================== РЕНДЕР КАРУСЕЛИ + АНИМАЦИИ ===================== */
function renderCarousel() {
    const container = document.getElementById('carousel-container');
    const indicators = document.getElementById('indicators');

    if (!container) return;
    if (!newsData || newsData.length === 0) {
        container.innerHTML = '<div class="error">Новости не загружены</div>';
        return;
    }

    console.log(`Рендерим ${newsData.length} новостей`);

    let fragment = document.createDocumentFragment();

    newsData.forEach((item, index) => {
        const safeTitle = item.title || 'Новость IT-Sochi';
        const safeImage = item.image || getStaticPlaceholderImage(safeTitle, index);
        const safeDescription = item.description || 'Читать на сайте IT-Sochi...';
        const safeDate = item.date || 'Недавно';
        const safeLink = item.link || 'https://www.it-sochi.ru/news/';

        const slide = document.createElement('div');
        slide.className = 'news-card carousel-slide';
        slide.tabIndex = 0;
        slide.setAttribute('data-index', index);
        slide.style.opacity = '0';
        slide.style.transform = 'translateY(18px)';
        slide.style.transition = 'opacity 550ms cubic-bezier(.2,.9,.2,1), transform 650ms cubic-bezier(.2,.9,.2,1)';
        slide.innerHTML = `
            <img src="${safeImage}" alt="${escapeHtml(safeTitle)}" class="news-image" loading="lazy">
            <div class="news-content">
                <div class="news-title">
                    <a href="${safeLink}" target="_blank" rel="noopener noreferrer" tabindex="-1">${escapeHtml(safeTitle)}</a>
                </div>
                <div class="news-description">${escapeHtml(safeDescription)}</div>
                <div class="news-meta">
                    <span>📅 ${escapeHtml(safeDate)}</span>
                    <span>🔗 it-sochi.ru</span>
                </div>
            </div>
        `;

        // Подготовка: стиль для картинки (размытие -> снятие при загрузке)
        const img = slide.querySelector('img.news-image');
        img.style.transition = 'transform 700ms cubic-bezier(.2,.9,.2,1), filter 700ms ease, opacity 400ms ease';
        img.style.filter = 'blur(8px) saturate(0.95)';
        img.style.opacity = '0.98';
        img.decoding = 'async';
        img.onerror = () => { img.src = getStaticPlaceholderImage(safeTitle, index); };

        // Когда картинка загрузится — плавно убираем blur и немного увеличим (parallax feel)
        img.onload = () => {
            requestAnimationFrame(() => {
                img.style.filter = 'blur(0px) saturate(1)';
                img.style.transform = 'scale(1.03)';
                img.style.opacity = '1';
                // После небольшого таймаута вернём к норме (оставляя лёгкий scale)
                setTimeout(() => {
                    img.style.transform = 'scale(1.0)';
                }, 700);
            });
        };

        // Tilt / micro-interaction: pointermove внутри карточки даёт лёгкий 3D-эффект
        addTiltEffect(slide, img);

        fragment.appendChild(slide);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
    totalSlides = newsData.length;

    // Создаем индикаторы
    if (indicators) {
        indicators.innerHTML = '';
        for (let i = 0; i < newsData.length; i++) {
            const dot = document.createElement('div');
            dot.classList.add('indicator');
            dot.dataset.index = i;
            dot.setAttribute('role', 'button');
            dot.setAttribute('aria-label', `Перейти к новости ${i + 1}`);
            dot.tabIndex = 0;
            if (i === currentSlide) dot.classList.add('active');
            dot.addEventListener('click', () => {
                currentSlide = i;
                updateCarousel(true);
                resetAutoScroll();
            });
            dot.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    dot.click();
                }
            });
            indicators.appendChild(dot);
        }
    }

    // Включаем плавный по очереди вход (stagger)
    const slides = Array.from(document.querySelectorAll('.carousel-slide'));
    slides.forEach((s, i) => {
        // небольшая задержка для ступенчатой анимации
        setTimeout(() => {
            s.style.opacity = '1';
            s.style.transform = 'translateY(0)';
        }, 70 * i);
    });

    // Обновление позиций и слушателей
    updateCarousel(false);
    addSwipeListeners();
    addKeyboardNavigation();
    addHoverPauseBehavior(container);
}

/* ===================== ПОМОЩНИК: escapeHtml ===================== */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/* ===================== ОБНОВЛЕНИЕ КАРУСЕЛИ ===================== */
function updateCarousel(animate = true) {
    const container = document.getElementById('carousel-container');
    const indicators = document.getElementById('indicators');
    if (!container || !newsData || newsData.length === 0) return;

    if (animate) {
        container.style.transition = 'transform 0.6s cubic-bezier(.2,.9,.2,1)';
    } else {
        container.style.transition = 'none';
    }
    container.style.transform = `translateX(-${currentSlide * 100}%)`;

    if (indicators) {
        [...indicators.children].forEach(dot => {
            dot.classList.remove('active');
            dot.getAnimations?.()?.forEach(a => a.cancel?.());
        });
        const activeDot = indicators.querySelector(`.indicator[data-index="${currentSlide}"]`);
        if (activeDot) {
            activeDot.classList.add('active');
            // Подсветка active dot — легкая пульсация через Web Animations API
            try {
                activeDot.animate([
                    { transform: 'scale(1)', boxShadow: '0 0 0px rgba(58,155,220,0.0)' },
                    { transform: 'scale(1.25)', boxShadow: '0 0 14px rgba(58,155,220,0.28)' },
                    { transform: 'scale(1)', boxShadow: '0 0 6px rgba(58,155,220,0.18)' }
                ], {
                    duration: 900,
                    iterations: 1,
                    easing: 'cubic-bezier(.2,.9,.2,1)'
                });
            } catch (e) {/* silent */}
        }
    }
}

/* ===================== SLIDE NAVIGATION ===================== */
function nextSlide() {
    if (totalSlides === 0) return;
    currentSlide = (currentSlide + 1) % totalSlides;
    updateCarousel();
}

function prevSlide() {
    if (totalSlides === 0) return;
    currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
    updateCarousel();
}

/* ===================== AUTOSCROLL ===================== */
function startAutoScroll() {
    stopAutoScroll();
    if (totalSlides > 1 && isTabFocused) {
        autoScrollInterval = setInterval(() => {
            nextSlide();
        }, AUTO_SCROLL_DELAY);
    }
}

function stopAutoScroll() {
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
}

function resetAutoScroll() {
    stopAutoScroll();
    startAutoScroll();
}

/* ===================== SWIPE / DRAG / POINTER ===================== */
function addSwipeListeners() {
    const container = document.getElementById('carousel-container');
    if (!container) return;

    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    container.classList.remove('dragging');

    container.onpointerdown = (e) => {
        isDragging = true;
        startX = e.clientX;
        currentX = startX;
        container.style.transition = 'none';
        container.classList.add('dragging');
        stopAutoScroll();
        e.preventDefault();
    };

    container.onpointermove = (e) => {
        if (!isDragging) return;
        currentX = e.clientX;
        const diffX = currentX - startX;
        const width = container.clientWidth;
        const percentage = (diffX / width) * 100;
        container.style.transform = `translateX(calc(${-currentSlide * 100}% + ${percentage}%))`;
    };

    container.onpointerup = (e) => {
        if (!isDragging) return;
        isDragging = false;
        container.classList.remove('dragging');
        const diffX = e.clientX - startX;
        const threshold = container.clientWidth / 6;

        if (diffX > threshold) {
            prevSlide();
        } else if (diffX < -threshold) {
            nextSlide();
        } else {
            updateCarousel();
        }
        startAutoScroll();
    };

    container.onpointercancel = container.onpointerleave = () => {
        if (isDragging) {
            isDragging = false;
            container.classList.remove('dragging');
            updateCarousel();
            startAutoScroll();
        }
    };
}

/* ===================== TILT / MICRO-INTERACTIONS ===================== */
function addTiltEffect(card, img) {
    // Добавляем деликатный tilt при наведении и лёгкий параллакс картинки
    let rect = null;

    function onEnter() {
        rect = card.getBoundingClientRect();
        card.style.transition = 'transform 350ms cubic-bezier(.2,.9,.2,1), box-shadow 350ms ease';
        card.style.willChange = 'transform';
        card.style.boxShadow = '0 12px 38px rgba(28,110,164,0.22)';
        // включаем pointermove слушатель
        card.addEventListener('pointermove', onMove);
    }
    function onLeave() {
        card.removeEventListener('pointermove', onMove);
        card.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0)';
        card.style.boxShadow = '';
        img.style.transform = 'scale(1)';
    }
    function onMove(e) {
        if (!rect) rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const rotateY = (px - 0.5) * 8; // degrees
        const rotateX = (0.5 - py) * 6; // degrees
        card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        // parallax on image
        const imgTranslateX = (px - 0.5) * 8;
        const imgTranslateY = (py - 0.5) * 6;
        img.style.transform = `translate3d(${imgTranslateX}px, ${imgTranslateY}px, 0) scale(1.03)`;
    }

    card.addEventListener('pointerenter', onEnter);
    card.addEventListener('pointerleave', onLeave);
    card.addEventListener('blur', onLeave);
}

/* ===================== КЛАВИАТУРНАЯ НАВИГАЦИЯ ===================== */
function addKeyboardNavigation() {
    // Если уже добавлен — пропускаем
    if (addKeyboardNavigation._added) return;
    addKeyboardNavigation._added = true;

    document.addEventListener('keydown', (e) => {
        // не блокируем, только если пользователь не в input/textarea
        const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

        if (e.key === 'ArrowRight') {
            nextSlide();
            resetAutoScroll();
        } else if (e.key === 'ArrowLeft') {
            prevSlide();
            resetAutoScroll();
        }
    });
}

/* ===================== ПАУЗА НА НАВЕДЕНИЕ / ФОКУС ===================== */
function addHoverPauseBehavior(container) {
    if (!container) return;

    container.addEventListener('pointerenter', () => {
        stopAutoScroll();
        // чуть подсветим активную карточку
        const activeCard = container.querySelector(`.carousel-slide[data-index="${currentSlide}"]`);
        if (activeCard) activeCard.style.transform = 'translateY(-6px) scale(1.01)';
    });
    container.addEventListener('pointerleave', () => {
        startAutoScroll();
        const activeCard = container.querySelector(`.carousel-slide[data-index="${currentSlide}"]`);
        if (activeCard) activeCard.style.transform = '';
    });

    // Останавливаем автоскролл если фокус внутри (для клавиатуры/экранных читалок)
    container.addEventListener('focusin', () => stopAutoScroll());
    container.addEventListener('focusout', () => startAutoScroll());
}

/* ===================== ОБРАБОТЧИКИ ЗАГРУЗКИ ВКЛАДКИ / АВТООБНОВЛЕНИЕ ===================== */
document.addEventListener('visibilitychange', () => {
    isTabFocused = document.visibilityState === 'visible';
    if (isTabFocused) startAutoScroll();
    else stopAutoScroll();
});

document.addEventListener('DOMContentLoaded', () => {
    const newsTab = document.querySelector('.tab[data-tab="news"]');
    const newsTabContent = document.getElementById('news-tab');

    function initNews() {
        if (newsData.length === 0) {
            loadNews().then(() => {
                startAutoScroll();
            });
        } else {
            startAutoScroll();
        }
    }

    if (newsTab) {
        newsTab.addEventListener('click', initNews);
    }

    if (newsTabContent && newsTabContent.classList.contains('active')) {
        initNews();
    }
});

/* ===================== ПЕРИОДИЧЕСКОЕ ОБНОВЛЕНИЕ КАЖДЫЕ 10 МИНУТ ===================== */
setInterval(() => {
    const newsTabContent = document.getElementById('news-tab');
    if (newsTabContent && newsTabContent.classList.contains('active')) {
        loadNews();
    }
}, 600000);

/* ===================== УТИЛИТЫ ===================== */
// Старый getPlaceholderImage оставлен, но мы используем getStaticPlaceholderImage
function getPlaceholderImage(text) {
    return getStaticPlaceholderImage(text);
}
