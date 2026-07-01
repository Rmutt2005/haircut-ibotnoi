document.addEventListener('DOMContentLoaded', () => {
    setDefaultDateTime();
    fetchBookings();
    setupSSE();

    const form = document.getElementById('manual-booking-form');
    form.addEventListener('submit', handleManualBookingSubmit);

    ['srv-wash', 'srv-style', 'srv-shave'].forEach(id => {
        document.getElementById(id).addEventListener('change', calculateBookingPrice);
    });
});

function setDefaultDateTime() {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(0);

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    document.getElementById('booking-datetime').value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

function calculateBookingPrice() {
    let total = 150;

    const wash = document.getElementById('srv-wash');
    const style = document.getElementById('srv-style');
    const shave = document.getElementById('srv-shave');

    if (wash.checked) total += parseInt(wash.getAttribute('data-price'));
    if (style.checked) total += parseInt(style.getAttribute('data-price'));
    if (shave.checked) total += parseInt(shave.getAttribute('data-price'));

    document.getElementById('booking-total-price').innerText = total;
    return total;
}

async function fetchBookings() {
    try {
        const response = await fetch('/api/bookings');
        if (!response.ok) throw new Error('Failed to fetch bookings');

        const bookings = await response.json();
        renderBookings(bookings);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        document.getElementById('bookings-list').innerHTML = `
            <tr class="empty-row">
                <td colspan="6" style="color: #ea4335;">
                    <i class="fa-solid fa-triangle-exclamation"></i> Error loading bookings from server.
                </td>
            </tr>
        `;
    }
}

function renderBookings(bookings) {
    const list = document.getElementById('bookings-list');

    if (!bookings || bookings.length === 0) {
        list.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">No appointments booked yet.</td>
            </tr>
        `;
        return;
    }

    list.innerHTML = '';
    bookings.forEach(booking => addBookingRow(booking, false));
}

function addBookingRow(booking, isNew = false) {
    const list = document.getElementById('bookings-list');
    const emptyRow = list.querySelector('.empty-row');

    if (emptyRow) {
        list.innerHTML = '';
    }

    const row = document.createElement('tr');
    if (isNew) {
        row.classList.add('new-booking-highlight');
    }

    const servicesTags = normalizeServices(booking.services)
        .map(service => `<span class="service-tag">${escapeHTML(service)}</span>`)
        .join('');
    const formattedDateTime = String(booking.date_time || '').replace('T', ' ');

    row.innerHTML = `
        <td><strong>${escapeHTML(booking.customer_name)}</strong></td>
        <td>${escapeHTML(booking.phone)}</td>
        <td><i class="fa-regular fa-clock text-muted"></i> ${escapeHTML(formattedDateTime)}</td>
        <td><span class="barber-badge">${escapeHTML(booking.barber_name)}</span></td>
        <td><div class="services-list-td">${servicesTags}</div></td>
        <td><span class="price-text">${escapeHTML(booking.total_price)} บาท</span></td>
    `;

    if (isNew) {
        list.insertBefore(row, list.firstChild);
    } else {
        list.appendChild(row);
    }
}

function setupSSE() {
    const pulseDot = document.querySelector('.pulse-dot');
    const statusText = document.querySelector('.status-text');
    const statusIndicator = document.querySelector('.status-indicator');
    const eventSource = new EventSource('/api/events');

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'CONNECTED') {
                setLiveStatus(true);
            } else if (data.type === 'NEW_BOOKING') {
                addBookingRow(data.booking, true);
                playChime();
            }
        } catch (error) {
            console.error('Error parsing SSE event:', error);
        }
    };

    eventSource.onerror = () => {
        setLiveStatus(false);
    };

    function setLiveStatus(connected) {
        if (connected) {
            statusIndicator.style.borderColor = 'rgba(46, 168, 87, 0.3)';
            statusIndicator.style.backgroundColor = 'rgba(46, 168, 87, 0.1)';
            pulseDot.style.backgroundColor = '#2ea857';
            pulseDot.style.animation = 'pulse 1.8s infinite';
            statusText.innerText = 'LIVE SYNCED (SSE)';
            statusText.style.color = '#2ea857';
            return;
        }

        statusIndicator.style.borderColor = 'rgba(234, 67, 53, 0.3)';
        statusIndicator.style.backgroundColor = 'rgba(234, 67, 53, 0.1)';
        pulseDot.style.backgroundColor = '#ea4335';
        pulseDot.style.animation = 'none';
        statusText.innerText = 'DISCONNECTED';
        statusText.style.color = '#ea4335';
    }
}

async function handleManualBookingSubmit(e) {
    e.preventDefault();

    const services = ['Haircut'];
    if (document.getElementById('srv-wash').checked) services.push('Wash & Dry');
    if (document.getElementById('srv-style').checked) services.push('Hair Styling');
    if (document.getElementById('srv-shave').checked) services.push('Shaving');

    const payload = {
        customer_name: document.getElementById('booking-name').value,
        phone: document.getElementById('booking-phone').value,
        date_time: document.getElementById('booking-datetime').value,
        barber_name: document.getElementById('booking-barber').value,
        services,
        total_price: calculateBookingPrice()
    };

    const alertEl = document.getElementById('booking-alert');
    showAlert(alertEl, 'info', '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกคิว...');

    try {
        const response = await fetch('/webhook/botnoi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Server error occurred');
        }

        showAlert(alertEl, 'success', '<i class="fa-solid fa-circle-check"></i> จองคิวเรียบร้อยแล้ว');
        document.getElementById('booking-name').value = '';
        document.getElementById('booking-phone').value = '';
        setDefaultDateTime();
        document.getElementById('booking-barber').value = 'Barber Jack';
        document.getElementById('srv-wash').checked = false;
        document.getElementById('srv-style').checked = false;
        document.getElementById('srv-shave').checked = false;
        calculateBookingPrice();

        setTimeout(() => {
            alertEl.classList.add('hidden');
        }, 4000);
    } catch (error) {
        console.error('Manual booking failed:', error);
        showAlert(alertEl, 'error', `<i class="fa-solid fa-circle-exclamation"></i> Error: ${escapeHTML(error.message)}`);
    }
}

function showAlert(element, type, message) {
    element.innerHTML = message;
    element.className = 'alert';

    if (type === 'success') {
        element.classList.add('success');
    } else if (type === 'error') {
        element.classList.add('error');
    } else {
        element.classList.add('info');
    }

    element.classList.remove('hidden');
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function normalizeServices(services) {
    if (Array.isArray(services)) return services;
    if (typeof services === 'string' && services.trim() !== '') {
        return services.split(',').map(service => service.trim()).filter(Boolean);
    }
    return ['Haircut'];
}

function formatCreatedAt(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'รายการใหม่ล่าสุด';

    return date.toLocaleString('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

function playChime() {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const osc = context.createOscillator();
        const gain = context.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.15);

        gain.gain.setValueAtTime(0.1, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);

        osc.connect(gain);
        gain.connect(context.destination);
        osc.start();
        osc.stop(context.currentTime + 0.4);
    } catch (e) {
        // Some browsers block AudioContext before interaction.
    }
}
