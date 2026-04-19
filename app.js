document.addEventListener('DOMContentLoaded', () => {
    // Configuración API
    const API_URL = 'https://TU-WORKER.workers.dev';

    // Elementos del DOM
    const btnRefresh = document.getElementById('btn-refresh');
    const tableBody = document.getElementById('table-body');
    const rowTemplate = document.getElementById('row-template');
    const tableContainer = document.querySelector('.table-container');
    const errorContainer = document.getElementById('error-container');
    const btnRetry = document.getElementById('btn-retry');
    const errorMessage = document.getElementById('error-message');

    // Inicializar formato de moneda basado en locales
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('es-CL', { 
            style: 'currency', 
            currency: 'CLP',
            maximumFractionDigits: 0
        }).format(value);
    };

    // Función para asignar colores basado en texto
    const getStatusClass = (text) => {
        const textLower = text.toLowerCase();
        if (textLower.includes('barato')) return 'barato';
        if (textLower.includes('caro')) return 'caro';
        if (textLower.includes('normal') || textLower.includes('promedio')) return 'normal';
        return 'default';
    };

    const getSignalClass = (text) => {
        const textLower = text.toLowerCase();
        if (textLower.includes('comprar')) return 'comprar';
        if (textLower.includes('esperar')) return 'esperar';
        return 'default';
    };

    // Renderizar una fila a partir del template
    const createFlightRow = (flight) => {
        const clone = rowTemplate.content.cloneNode(true);
        
        // Asignar Texto
        clone.querySelector('.ruta-badge').textContent = flight.ruta;
        clone.querySelector('.current-price').textContent = formatCurrency(flight.precio);
        clone.querySelector('.average-price').textContent = formatCurrency(flight.promedio);
        
        const estadoBadge = clone.querySelector('.badge-estado');
        estadoBadge.textContent = flight.estado;
        estadoBadge.classList.add(getStatusClass(flight.estado));

        const senalBadge = clone.querySelector('.badge-senal');
        senalBadge.textContent = flight.senal || flight.señal; // Cubrimos por si escriben ñ o n
        senalBadge.classList.add(getSignalClass(flight.senal || flight.señal || ''));

        return clone;
    };

    // Función principal de fetch
    const fetchFlights = async () => {
        // Establecer UI en modo "Carga"
        btnRefresh.disabled = true;
        btnRefresh.innerHTML = `
            <div class="spinner" style="width:16px; height:16px; border-width:2px; margin-bottom:0; border-top-color:#fff;"></div>
            <span>Actualizando...</span>
        `;
        
        errorContainer.classList.add('hidden');
        tableContainer.classList.remove('hidden');

        tableBody.innerHTML = `
            <tr id="loading-row">
                <td colspan="5" class="status-message">
                    <div class="spinner"></div>
                    <div>Cargando vuelos actualizados...</div>
                </td>
            </tr>
        `;

        try {
            const response = await fetch(API_URL);

            if (!response.ok) {
                throw new Error(`Error en el servidor: ${response.status}`);
            }

            const data = await response.json();

            // Validar si es array válido
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('La API devolvió datos vacíos o en un formato incorrecto.');
            }

            // Limpiar tabla (quitar spinner)
            tableBody.innerHTML = '';

            // Renderizar cada vuelo, ¡Usamos SOLAMENTE datos de la API, sin falsificar!
            data.forEach(flight => {
                tableBody.appendChild(createFlightRow(flight));
            });

        } catch (error) {
            console.error('Error al obtener datos:', error);
            
            // Mostrar estado de error
            tableContainer.classList.add('hidden');
            errorContainer.classList.remove('hidden');
            errorMessage.textContent = error.message === 'Failed to fetch' 
                ? 'No se pudo conectar al Worker (Asegúrate de que permita peticiones CORS).'
                : error.message;

        } finally {
            // Restaurar botón
            btnRefresh.disabled = false;
            btnRefresh.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path>
                </svg>
                <span>Actualizar precios</span>
            `;
        }
    };

    // Eventos
    btnRefresh.addEventListener('click', fetchFlights);
    btnRetry.addEventListener('click', fetchFlights);

    // Carga inicial automática
    fetchFlights();
});
