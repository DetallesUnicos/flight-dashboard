document.addEventListener('DOMContentLoaded', () => {
    // URL del Worker
    const API_URL = 'https://raspy-field-9186.sebaauto232.workers.dev';

    // Elementos del DOM
    const btnRefresh = document.getElementById('btn-refresh');
    const tableBody = document.getElementById('table-body');
    const rowTemplate = document.getElementById('row-template');
    const tableContainer = document.querySelector('.table-container');
    const errorContainer = document.getElementById('error-container');
    const btnRetry = document.getElementById('btn-retry');
    const errorMessage = document.getElementById('error-message');
    const lastUpdateSpan = document.getElementById('last-update');

    let fetchTimestamp = null;
    let timerInterval = null;

    // Formatear Moneda en dólares
    const formatCurrency = (value) => {
        if (!value && value !== 0) return '-';
        return new Intl.NumberFormat('en-US', { 
            style: 'currency', 
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(value);
    };

    // Generar URL de Google Flights para la ruta
    const buildFlightUrl = (ruta) => {
        if (!ruta) return '#';
        const [origen, destino] = ruta.split('-');
        if (!origen || !destino) return '#';

        // Calcular fechas igual que el Worker: hoy +30 ida, +37 vuelta
        const fechaIda = new Date();
        fechaIda.setDate(fechaIda.getDate() + 30);
        const fechaVuelta = new Date(fechaIda);
        fechaVuelta.setDate(fechaVuelta.getDate() + 7);

        const fmt = (d) => d.toISOString().split('T')[0];
        // Formato Google Flights deep link
        return `https://www.google.com/travel/flights?hl=es&curr=USD#flt=${origen}.${destino}.${fmt(fechaIda)}*${destino}.${origen}.${fmt(fechaVuelta)};c:USD;e:1;sd:1;t:f`;
    };

    // Interpretar Estado (Barato, Caro, Normal)
    const getStatusClass = (text) => {
        if (!text) return 'default';
        const textLower = text.toLowerCase();
        if (textLower.includes('barato')) return 'barato';
        if (textLower.includes('caro')) return 'caro';
        if (textLower.includes('error')) return 'error';
        return 'normal';
    };

    // Interpretar Señal (Comprar, Posible Compra, Esperar)
    const getSignalClass = (text) => {
        if (!text) return 'default';
        const textLower = text.toLowerCase();
        if (textLower.includes('posible')) return 'posible-compra';
        if (textLower.includes('comprar')) return 'comprar';
        if (textLower.includes('esperar')) return 'esperar';
        if (textLower.includes('error')) return 'error';
        return 'default';
    };

    // Contador visual "Hace X segundos/minutos"
    const updateTimeVisual = () => {
        if (!fetchTimestamp) return;
        const now = new Date();
        const diffSeconds = Math.floor((now - fetchTimestamp) / 1000);
        
        if (diffSeconds < 60) {
            lastUpdateSpan.textContent = `Actualizado hace ${diffSeconds} seg`;
        } else {
            const resultMins = Math.floor(diffSeconds / 60);
            lastUpdateSpan.textContent = `Actualizado hace ${resultMins} min`;
        }
    };

    // Renderizar una fila (clickeable → Google Flights)
    const createFlightRow = (flight) => {
        const clone = rowTemplate.content.cloneNode(true);
        const row = clone.querySelector('.flight-row');

        // Hacer la fila clickeable
        const url = buildFlightUrl(flight.ruta);
        row.style.cursor = 'pointer';
        row.title = 'Ver en Google Flights';
        row.addEventListener('click', () => window.open(url, '_blank'));
        
        // Asignación principal
        clone.querySelector('.ruta-badge').textContent = flight.ruta || 'N/A';

        // Tipo de vuelo (ida / ida y vuelta)
        const tipoStr = flight.tipo || 'Solo ida';
        const tipoBadge = clone.querySelector('.badge-tipo');
        tipoBadge.textContent = tipoStr;
        if (tipoStr.toLowerCase().includes('vuelta')) {
            tipoBadge.classList.add('ida-vuelta');
        } else {
            tipoBadge.classList.add('ida');
        }

        // Manejo "error: true" individual de la ruta
        if (flight.error === true || String(flight.estado).toLowerCase().includes('error')) {
            row.classList.add('is-error');
            clone.querySelector('.current-price').textContent = 'Error AP';
            clone.querySelector('.average-price').textContent = '-';
            
            const est = clone.querySelector('.badge-estado');
            est.textContent = 'Error';
            est.classList.add('error');

            const sen = clone.querySelector('.badge-senal');
            sen.textContent = 'N/A';
            sen.classList.add('error');
        } else {
            clone.querySelector('.current-price').textContent = formatCurrency(flight.precio);
            clone.querySelector('.average-price').textContent = formatCurrency(flight.promedio);

            // Mostrar fecha de última actualización debajo del precio
            if (flight.fecha) {
                const fechaEl = document.createElement('span');
                fechaEl.className = 'price-date';
                const d = new Date(flight.fecha);
                fechaEl.textContent = `Actualizado: ${d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
                clone.querySelector('.current-price').appendChild(fechaEl);
            }
            
            const estadoStr = flight.estado || '-';
            const estadoBadge = clone.querySelector('.badge-estado');
            estadoBadge.textContent = estadoStr;
            estadoBadge.classList.add(getStatusClass(estadoStr));

            const senalStr = flight.senal || flight.señal || '-';
            const senalBadge = clone.querySelector('.badge-senal');
            senalBadge.textContent = senalStr;
            senalBadge.classList.add(getSignalClass(senalStr));
        }

        return clone;
    };

    // Fetch Simple desde backend
    const fetchFlights = async () => {
        // Bloquear botón e iniciar animación visual de carga
        btnRefresh.disabled = true;
        btnRefresh.innerHTML = `
            <div class="spinner" style="width:14px; height:14px; border-width:2px; margin-bottom:0; border-top-color:#fff;"></div>
            <span>Calculando...</span>
        `;
        
        errorContainer.classList.add('hidden');
        tableContainer.classList.remove('hidden');

        tableBody.innerHTML = `
            <tr id="loading-row">
                <td colspan="6" class="status-message">
                    <div class="spinner"></div>
                    <div>Obteniendo rutas desde Cloudflare Worker...</div>
                </td>
            </tr>
        `;

        try {
            const response = await fetch(API_URL);

            if (!response.ok) {
                throw new Error(`Worker devolvió código ${response.status}`);
            }

            const data = await response.json();

            // Limpiar tabla
            tableBody.innerHTML = '';

            if (!Array.isArray(data) || data.length === 0) {
                tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="status-message">Sin datos de rutas disponibles desde el worker.</td>
                </tr>`;
            } else {
                // Ordenar por ruta
                data.sort((a, b) => (a.ruta || '').localeCompare(b.ruta || ''));
                data.forEach(flight => {
                    tableBody.appendChild(createFlightRow(flight));
                });
            }

            // Éxito: Marcar timestamp e iniciar auto-update
            fetchTimestamp = new Date();
            lastUpdateSpan.textContent = `Actualizado ahora`;
            
            if(timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTimeVisual, 1000);

        } catch (error) {
            console.error('API Fetch Error:', error);
            
            // Pausar reloj
            if(timerInterval) clearInterval(timerInterval);
            lastUpdateSpan.textContent = 'Error de actualización';

            // Mostrar Error Global
            tableContainer.classList.add('hidden');
            errorContainer.classList.remove('hidden');
            errorMessage.textContent = error.message === 'Failed to fetch' 
                ? 'Error CORS o Worker caído: Asegúrate de que el backend en Cloudflare responda y permita Access-Control-Allow-Origin.'
                : error.message;

        } finally {
            // Restaurar botón (solo frontend)
            btnRefresh.disabled = false;
            btnRefresh.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path>
                </svg>
                <span>Actualizar precios</span>
            `;
        }
    };

    // Listeners
    btnRefresh.addEventListener('click', fetchFlights);
    btnRetry.addEventListener('click', fetchFlights);

    // Cargar apenas se abre la página
    fetchFlights();

    // Contador del Bot (Cron a las 08:00 UTC = 05:00 ARG)
    const updateCountdown = () => {
        const cronEl = document.getElementById('cron-countdown');
        if (!cronEl) return;
        
        const now = new Date();
        const nextCron = new Date();
        nextCron.setUTCHours(8, 0, 0, 0); // 08:00 UTC
        
        // Si ya pasaron las 08:00 UTC de hoy, el próximo es mañana
        if (now > nextCron) {
            nextCron.setUTCDate(nextCron.getUTCDate() + 1);
        }
        
        const diff = nextCron - now;
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        
        cronEl.textContent = `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    };
    
    updateCountdown();
    setInterval(updateCountdown, 1000);

});
