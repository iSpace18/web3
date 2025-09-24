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

// Применение темы
function applyTheme(theme) {
  if (theme === 'dark' || (theme === 'auto' && tg && tg.colorScheme === 'dark')) {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (tg && tg.setHeaderColor) tg.setHeaderColor('#1e1e1e');
  } else {
      document.documentElement.setAttribute('data-theme', 'light');
      if (tg && tg.setHeaderColor) tg.setHeaderColor('#2481cc');
  }
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

// JavaScript для новостей
const PROXIES = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://cors-anywhere.herokuapp.com/'
];

let currentProxyIndex = 0;
let currentSlide = 0;
let totalSlides = 0;
let newsData = [];

async function loadNews() {
    const container = document.getElementById('carousel-container');
    const counter = document.getElementById('news-counter');
    
    if (!container) return;
    
    container.innerHTML = '<div class="loading">⏳ Загружаем новости с картинками...</div>';
    if (counter) counter.textContent = 'Загрузка...';

    try {
        const news = await fetchWithProxies();
        
        if (news.error) {
            throw new Error(news.error);
        }

        if (news.length === 0) {
            container.innerHTML = '<div class="error">❌ Новости не найдены</div>';
            if (counter) counter.textContent = 'Новостей: 0';
            return;
        }

        newsData = news;
        totalSlides = news.length;
        currentSlide = 0;

        if (counter) counter.textContent = `Загружено новостей: ${news.length}`;
        renderCarousel();

    } catch (error) {
        console.error('Ошибка:', error);
        container.innerHTML = `
            <div class="error">
                ❌ Ошибка загрузки: ${error.message}
                <br><small>Попробуйте обновить страницу</small>
            </div>`;
        if (counter) counter.textContent = 'Ошибка загрузки';
    }
}

function renderCarousel() {
    const container = document.getElementById('carousel-container');
    const indicators = document.getElementById('indicators');
    
    if (!container) return;
    
    let html = '';
    newsData.forEach((item, index) => {
        html += `
            <div class="news-card">
                <img src="${item.image}" alt="${item.title}" class="news-image" 
                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPklULVNvY2hpPC90ZXh0Pjwvc3ZnPg=='">
                <div class="news-content">
                    <div class="news-title">
                        <a href="${item.link}" target="_blank" rel="noopener noreferrer">
                            ${item.title}
                        </a>
                    </div>
                    <div class="news-description">
                        ${item.description}
                    </div>
                    <div class="news-meta">
                        <span>📅 ${item.date}</span>
                        <span>🔗 ${extractDomain(item.link)}</span>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    container.style.transform = `translateX(-${currentSlide * 295}px)`;

    if (indicators) {
        indicators.innerHTML = '';
        for (let i = 0; i < totalSlides; i++) {
            indicators.innerHTML += `<div class="indicator ${i === currentSlide ? 'active' : ''}" onclick="goToSlide(${i})"></div>`;
        }
    }

    updateControls();
}

function extractDomain(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return 'it-sochi.ru';
    }
}

function nextSlide() {
    if (currentSlide < totalSlides - 1) {
        currentSlide++;
        updateCarousel();
    }
}

function prevSlide() {
    if (currentSlide > 0) {
        currentSlide--;
        updateCarousel();
    }
}

function goToSlide(slideIndex) {
    currentSlide = slideIndex;
    updateCarousel();
}

function updateCarousel() {
    const container = document.getElementById('carousel-container');
    const indicators = document.getElementById('indicators');
    
    if (!container) return;
    
    container.style.transform = `translateX(-${currentSlide * 295}px)`;
    
    if (indicators) {
        const indicatorElements = indicators.querySelectorAll('.indicator');
        indicatorElements.forEach((indicator, index) => {
            indicator.classList.toggle('active', index === currentSlide);
        });
    }
    
    updateControls();
}

function updateControls() {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    if (prevBtn && nextBtn) {
        prevBtn.disabled = currentSlide === 0;
        nextBtn.disabled = currentSlide === totalSlides - 1;
    }
}

async function fetchWithProxies(retryCount = 0) {
    if (retryCount >= PROXIES.length) {
        return getDemoNews();
    }

    const proxy = PROXIES[currentProxyIndex];
    const targetUrl = 'https://www.it-sochi.ru/news/';
    
    try {
        const response = await fetch(proxy + encodeURIComponent(targetUrl), {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        return parseNewsFromHTML(html);

    } catch (error) {
        console.warn(`Прокси ${proxy} не сработал:`, error.message);
        currentProxyIndex = (currentProxyIndex + 1) % PROXIES.length;
        return fetchWithProxies(retryCount + 1);
    }
}

function parseNewsFromHTML(html) {
    const news = [];
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const newsLinks = doc.querySelectorAll('a[href*="/news/"]');
    
    newsLinks.forEach(link => {
        if (news.length >= 10) return;
        
        try {
            const href = link.getAttribute('href');
            const title = link.textContent.trim();
            
            if (!href || !title || 
                title.length < 15 || 
                href.includes('category') ||
                href.includes('tag') ||
                title.match(/^(главная|новости|читать|далее|→|>>)$/i)) {
                return;
            }
            
            let fullUrl = href;
            if (!fullUrl.startsWith('http')) {
                fullUrl = 'https://www.it-sochi.ru' + (fullUrl.startsWith('/') ? fullUrl : '/' + fullUrl);
            }
            
            let image = '';
            let description = '';
            let date = 'Сегодня';
            
            const parent = link.closest('article, .news-item, .post, .item, div');
            if (parent) {
                const img = parent.querySelector('img');
                if (img) {
                    image = img.src;
                    if (!image.startsWith('http')) {
                        image = 'https://www.it-sochi.ru' + (image.startsWith('/') ? image : '/' + image);
                    }
                }
                
                const descEl = parent.querySelector('p, .description, .excerpt, .text');
                if (descEl) {
                    description = descEl.textContent.trim();
                    if (description.length > 150) {
                        description = description.substring(0, 150) + '...';
                    }
                }
                
                const dateEl = parent.querySelector('time, .date, .post-date, .news-date');
                if (dateEl) {
                    date = dateEl.textContent.trim();
                }
            }
            
            news.push({
                title: title,
                link: fullUrl,
                description: description || 'Читать полную версию статьи на сайте IT-Sochi...',
                image: image || getPlaceholderImage(title),
                date: date
            });
            
        } catch (e) {
            console.warn('Ошибка парсинга ссылки:', e);
        }
    });

    const uniqueNews = news.filter((item, index, self) => 
        index === self.findIndex(t => t.link === item.link)
    );

    if (uniqueNews.length === 0) {
        return getDemoNews();
    }

    return uniqueNews.slice(0, 8);
}

function getPlaceholderImage(title) {
    const colors = ['#3498db', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6', '#1abc9c'];
    const color = colors[title.length % colors.length];
    
    return `data:image/svg+xml;base64,${btoa(`
        <svg width="300" height="180" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="${color}"/>
            <text x="50%" y="50%" font-family="Arial" font-size="14" fill="white" 
                  text-anchor="middle" dy=".3em">${title.substring(0, 30)}</text>
        </svg>
    `)}`;
}

function getDemoNews() {
    return [
        {
            title: "IT мероприятия в Сочи - расписание на 2024 год",
            link: "https://www.it-sochi.ru/news/it-meropriyatiya-sochi-2024/",
            description: "Анонсы предстоящих IT мероприятий, конференций и митапов в Сочи. Присоединяйтесь к IT сообществу!",
            image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzQ5OGRiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JVCBNZXJvcHJpYXRpYTwvdGV4dD48L3N2Zz4=",
            date: "Сегодня"
        },
        {
            title: "Стартап экосистема Сочи: новые проекты и инвесторы",
            link: "https://www.it-sochi.ru/news/startup-ecosystem-sochi/",
            description: "Обзор самых перспективных IT стартапов в регионе и возможности для инвестиций.",
            image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTc0YzEzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TdGFydHVwczwvdGV4dD48L3N2Zz4=",
            date: "Вчера"
        }
    ];
}

// Автопрокрутка карусели
function startAutoScroll() {
    setInterval(() => {
        if (totalSlides > 0) {
            if (currentSlide < totalSlides - 1) {
                nextSlide();
            } else {
                currentSlide = 0;
                updateCarousel();
            }
        }
    }, 5000);
}

// Загружаем при старте и при переключении на вкладку новостей
document.addEventListener('DOMContentLoaded', () => {
    // Загружаем новости когда открывается вкладка новостей
    const newsTab = document.querySelector('.tab[data-tab="news"]');
    if (newsTab) {
        newsTab.addEventListener('click', function() {
            if (newsData.length === 0) {
                loadNews();
                startAutoScroll();
            }
        });
    }
    
    // Если активна вкладка новостей при загрузке
    const newsTabContent = document.getElementById('news-tab');
    if (newsTabContent && newsTabContent.classList.contains('active')) {
        loadNews();
        startAutoScroll();
    }
});

// Обновление каждые 10 минут
setInterval(() => {
    const newsTabContent = document.getElementById('news-tab');
    if (newsTabContent && newsTabContent.classList.contains('active')) {
        loadNews();
    }
}, 600000);