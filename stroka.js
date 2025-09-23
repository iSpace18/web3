        // Бесплатные CORS прокси
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
            
            container.innerHTML = '<div class="loading">⏳ Загружаем новости с картинками...</div>';
            counter.textContent = 'Загрузка...';

            try {
                const news = await fetchWithProxies();
                
                if (news.error) {
                    throw new Error(news.error);
                }

                if (news.length === 0) {
                    container.innerHTML = '<div class="error">❌ Новости не найдены</div>';
                    counter.textContent = 'Новостей: 0';
                    return;
                }

                newsData = news;
                totalSlides = news.length;
                currentSlide = 0;

                // Обновляем счетчик
                counter.textContent = `Загружено новостей: ${news.length}`;

                // Создаем карусель
                renderCarousel();

            } catch (error) {
                console.error('Ошибка:', error);
                container.innerHTML = `
                    <div class="error">
                        ❌ Ошибка загрузки: ${error.message}
                        <br><small>Попробуйте обновить страницу</small>
                    </div>`;
                counter.textContent = 'Ошибка загрузки';
            }
        }

        function renderCarousel() {
            const container = document.getElementById('carousel-container');
            const indicators = document.getElementById('indicators');
            
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
                                <span>🔗 ${new URL(item.link).hostname}</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
            container.style.transform = `translateX(-${currentSlide * 320}px)`;

            // Создаем индикаторы
            indicators.innerHTML = '';
            for (let i = 0; i < totalSlides; i++) {
                indicators.innerHTML += `<div class="indicator ${i === currentSlide ? 'active' : ''}" onclick="goToSlide(${i})"></div>`;
            }

            updateControls();
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
            
            container.style.transform = `translateX(-${currentSlide * 320}px)`;
            
            // Обновляем индикаторы
            const indicatorElements = indicators.querySelectorAll('.indicator');
            indicatorElements.forEach((indicator, index) => {
                indicator.classList.toggle('active', index === currentSlide);
            });
            
            updateControls();
        }

        function updateControls() {
            document.getElementById('prev-btn').disabled = currentSlide === 0;
            document.getElementById('next-btn').disabled = currentSlide === totalSlides - 1;
        }

        async function fetchWithProxies(retryCount = 0) {
            if (retryCount >= PROXIES.length) {
                // Возвращаем демо-данные если прокси не работают
                return getDemoNews();
            }

            const proxy = PROXIES[currentProxyIndex];
            const targetUrl = 'https://www.it-sochi.ru/news/';
            
            try {
                console.log(`Пробуем прокси: ${proxy}`);
                
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
                
                // Переключаемся на следующий прокси
                currentProxyIndex = (currentProxyIndex + 1) % PROXIES.length;
                return fetchWithProxies(retryCount + 1);
            }
        }

        function parseNewsFromHTML(html) {
            const news = [];
            
            // Создаем временный DOM для парсинга
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Ищем новостные блоки
            const newsElements = doc.querySelectorAll('article, .news-item, .post, .item');
            
            newsElements.forEach(element => {
                if (news.length >= 10) return;
                
                try {
                    // Заголовок
                    const titleEl = element.querySelector('h2, h3, h1, .title, a');
                    const title = titleEl ? titleEl.textContent.trim() : '';
                    
                    // Ссылка
                    const linkEl = element.querySelector('a');
                    let link = linkEl ? linkEl.href : '';
                    if (link && !link.startsWith('http')) {
                        link = 'https://www.it-sochi.ru' + (link.startsWith('/') ? link : '/' + link);
                    }
                    
                    // Описание
                    const descEl = element.querySelector('p, .description, .excerpt');
                    let description = descEl ? descEl.textContent.trim() : '';
                    if (description.length > 150) {
                        description = description.substring(0, 150) + '...';
                    }
                    
                    // Картинка
                    const imgEl = element.querySelector('img');
                    let image = imgEl ? imgEl.src : '';
                    if (image && !image.startsWith('http')) {
                        image = 'https://www.it-sochi.ru' + (image.startsWith('/') ? image : '/' + image);
                    }
                    
                    // Дата
                    const dateEl = element.querySelector('time, .date, .post-date');
                    const date = dateEl ? dateEl.textContent.trim() : 'Сегодня';
                    
                    if (title && link && title.length > 10) {
                        news.push({
                            title: title,
                            link: link,
                            description: description || 'Читать далее на IT-Sochi...',
                            image: image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZDFkMWQxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPklULVNvY2hpIE5ld3M8L3RleHQ+PC9zdmc+',
                            date: date
                        });
                    }
                } catch (e) {
                    console.warn('Ошибка парсинга элемента:', e);
                }
            });

            // Если не нашли новостей, возвращаем демо-данные
            if (news.length === 0) {
                return getDemoNews();
            }

            return news.slice(0, 10); // Ограничиваем количество
        }

        function getDemoNews() {
            return [
                {
                    title: "IT мероприятия в Сочи - расписание на 2024 год",
                    link: "https://www.it-sochi.ru/news/",
                    description: "Анонсы предстоящих IT мероприятий, конференций и митапов в Сочи. Присоединяйтесь к IT сообществу!",
                    image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzQ5OGRiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JVCBNZXJvcHJpYXRpYTwvdGV4dD48L3N2Zz4=",
                    date: "Сегодня"
                },
                {
                    title: "Стартап экосистема Сочи: новые проекты и инвесторы",
                    link: "https://www.it-sochi.ru/news/",
                    description: "Обзор самых перспективных IT стартапов в регионе и возможности для инвестиций.",
                    image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTc0YzEzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TdGFydHVwczwvdGV4dD48L3N2Zz4=",
                    date: "Вчера"
                },
                {
                    title: "IT образование в Сочи: курсы, воркшопы, обучение",
                    link: "https://www.it-sochi.ru/news/",
                    description: "Где получить качественное IT образование в Сочи. Обзор учебных программ и курсов.",
                    image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMjdhZTYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5FZHVjYXRpb248L3RleHQ+PC9zdmc+",
                    date: "2 дня назад"
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

        // Загружаем при старте
        document.addEventListener('DOMContentLoaded', () => {
            loadNews();
            startAutoScroll();
        });
        
        // Обновление каждые 10 минут
        setInterval(loadNews, 600000);