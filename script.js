// ==== KONFIGURASI FIREBASE ====
const firebaseConfig = {
    apiKey: "AIzaSyA_NfvZGXjqPKZ7QvUujP-5t0-CKbwwuhM",
    authDomain: "absensi-kir-sman-1-lemahabang.firebaseapp.com",
    databaseURL: "https://absensi-kir-sman-1-lemahabang-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "absensi-kir-sman-1-lemahabang",
    storageBucket: "absensi-kir-sman-1-lemahabang.firebasestorage.app",
    messagingSenderId: "434762674944",
    appId: "1:434762674944:web:1760788b3f67ff9646f9e5"
};
firebase.initializeApp(firebaseConfig);

// ==== KONFIGURASI SUPABASE (STORAGE) ====
const supabaseUrl = 'https://hwljckozqobryksiliip.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3bGpja296cW9icnlrc2lsaWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjIyMTQsImV4cCI6MjA5Mjg5ODIxNH0.HnUA_iF-OP38YjqK4laPLbpkbfDTiVuG189vJoIprn0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

// ==== DATA SISWA PER KELAS (dari Firebase) ====
let daftarNamaPerKelas = {};
firebase.database().ref('siswa').on('value', (snapshot) => {
    daftarNamaPerKelas = snapshot.val() || {};
    refreshActiveUI();
});

let dbAbsensi = [];
let streamKamera = null;
let currentUser = null; // { role: 'admin' } atau { role: 'admin_kelas', username, kelas }

// ==== LISTENER REAL‑TIME FIREBASE ====
function initFirebaseListeners() {
    firebase.database().ref('absensi').on('value', (snapshot) => {
        const val = snapshot.val();
        dbAbsensi = val ? Object.keys(val).map(key => ({ id: key, ...val[key] })) : [];
        refreshActiveUI();
    });

    firebase.database().ref('settings/status_absen').on('value', (snapshot) => {
        const status = snapshot.val();
        const absenPanel = document.getElementById('panel-absen');
        if (status === 'ditutup' && absenPanel.classList.contains('active')) {
            switchPanel('panel-awal');
            matikanKamera();
            Swal.fire({
                title: 'Absensi Ditutup',
                text: 'Siswa tidak bisa absen.',
                icon: 'warning',
                timer: 3000,
                timerProgressBar: true,
                showConfirmButton: false
            });
        }
    });
}
initFirebaseListeners();

function refreshActiveUI() {
    const dashboardAdmin = document.getElementById('panel-dashboard-admin');
    const dashboardKelas = document.getElementById('panel-dashboard-kelas');
    const absenPanel = document.getElementById('panel-absen');
    const modalKehadiran = document.getElementById('modal-kehadiran');
    const modalKehadiranKelas = document.getElementById('modal-kehadiran-kelas');

    if (dashboardAdmin.classList.contains('active')) renderTabelAdmin();
    if (dashboardKelas.classList.contains('active')) renderTabelKelas();
    if (absenPanel.classList.contains('active')) {
        const kelas = document.getElementById('kelas').value;
        if (kelas) renderNama(document.getElementById('search-nama').value);
    }
    if (modalKehadiran.classList.contains('show')) renderTabelKehadiran();
    if (modalKehadiranKelas.classList.contains('show')) renderTabelKehadiranKelas();
}

// ==== FUNGSI LOGIN UMUM (ADMIN & ADMIN KELAS) ====
async function loginUmum() {
    const user = document.getElementById('admin-user').value.trim();
    const pass = document.getElementById('admin-pass').value.trim();
    if (!user || !pass) {
        return Swal.fire({ title: 'Gagal', text: 'Isi username dan password.', icon: 'warning', timer: 2000, timerProgressBar: true, showConfirmButton: false });
    }

    const adminSnap = await firebase.database().ref('admin/' + user).once('value');
    if (adminSnap.exists() && adminSnap.val().password === pass) {
        currentUser = { role: 'admin' };
        document.getElementById('admin-user').value = '';
        document.getElementById('admin-pass').value = '';
        switchPanel('panel-dashboard-admin', true);
        renderTabelAdmin();
        updateTeksTombolBukaTutup();
        return;
    }

    const adminKelasSnap = await firebase.database().ref('admin_perkelas/' + user).once('value');
    if (adminKelasSnap.exists() && adminKelasSnap.val().password === pass) {
        const data = adminKelasSnap.val();
        currentUser = { role: 'admin_kelas', username: user, kelas: data.kelas };
        document.getElementById('admin-user').value = '';
        document.getElementById('admin-pass').value = '';
        switchPanel('panel-dashboard-kelas', true);
        document.getElementById('admin-kelas-display').innerText = `Admin Kelas ${data.kelas}`;
        renderTabelKelas();
        return;
    }

    Swal.fire({ title: 'Login Gagal', text: 'Username atau password salah.', icon: 'error', timer: 2000, timerProgressBar: true, showConfirmButton: false });
}

function logoutUmum() {
    currentUser = null;
    switchPanel('panel-awal', false);
}

// ==== ADMIN UTAMA: KELOLA ADMIN KELAS ====
function bukaModalKelolaAdminKelas() {
    openModal('modal-kelola-admin');
    renderDaftarAdminKelas();
    generateAdminKelasPilihList();
    document.getElementById('admin-baru-kelas').value = '';
    document.getElementById('teks-admin-baru-kelas').innerText = '-- Pilih Kelas --';
    document.getElementById('btn-admin-baru-kelas').classList.remove('selected');
}

async function renderDaftarAdminKelas() {
    const container = document.getElementById('daftar-admin-kelas');
    const snap = await firebase.database().ref('admin_perkelas').once('value');
    const data = snap.val() || {};
    const adminArray = Object.keys(data).map(username => ({ username, ...data[username] }));
    if (adminArray.length === 0) {
        container.innerHTML = '<p style="color:#888; text-align:center;">Belum ada admin perkelas.</p>';
        return;
    }
    container.innerHTML = adminArray.map(a => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border:1px solid var(--border-light); border-radius:12px; margin-bottom:8px;">
            <div><strong>${a.username}</strong><br><small style="color:#64748b;">Kelas: ${a.kelas}</small></div>
            <button class="btn-small btn-delete-small" onclick="hapusAdminKelas('${a.username}')">Hapus</button>
        </div>
    `).join('');
}

function generateAdminKelasPilihList() {
    const container = document.getElementById('list-admin-kelas-pilih-container');
    container.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const kelas = "XIF" + i;
        container.innerHTML += `<div class="modal-item" onclick="pilihAdminBaruKelas('${kelas}')">${kelas}</div>`;
    }
}

function pilihAdminBaruKelas(kelas) {
    document.getElementById('admin-baru-kelas').value = kelas;
    document.getElementById('teks-admin-baru-kelas').innerText = kelas;
    document.getElementById('btn-admin-baru-kelas').classList.add('selected');
    closeModal('modal-admin-kelas-pilih');
}

async function tambahAdminKelas() {
    const username = document.getElementById('admin-baru-user').value.trim();
    const password = document.getElementById('admin-baru-pass').value.trim();
    const kelas = document.getElementById('admin-baru-kelas').value;
    if (!username || !password || !kelas) {
        return Swal.fire({ title: 'Gagal', text: 'Isi semua data.', icon: 'warning', timer: 2000, timerProgressBar: true, showConfirmButton: false });
    }
    const adminSnap = await firebase.database().ref('admin/' + username).once('value');
    const adminKelasSnap = await firebase.database().ref('admin_perkelas/' + username).once('value');
    if (adminSnap.exists() || adminKelasSnap.exists()) {
        return Swal.fire({ title: 'Gagal', text: 'Username sudah digunakan.', icon: 'error', timer: 2000, timerProgressBar: true, showConfirmButton: false });
    }
    await firebase.database().ref('admin_perkelas/' + username).set({ password, kelas });
    Swal.fire({ title: 'Sukses', text: 'Admin kelas berhasil ditambahkan.', icon: 'success', timer: 2000, timerProgressBar: true, showConfirmButton: false });
    document.getElementById('admin-baru-user').value = '';
    document.getElementById('admin-baru-pass').value = '';
    document.getElementById('admin-baru-kelas').value = '';
    renderDaftarAdminKelas();
}

async function hapusAdminKelas(username) {
    Swal.fire({
        title: 'Hapus Admin?',
        text: `Admin ${username} akan dihapus.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Ya'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await firebase.database().ref('admin_perkelas/' + username).remove();
            Swal.fire({ title: 'Terhapus', text: 'Admin kelas berhasil dihapus.', icon: 'success', timer: 2000, timerProgressBar: true, showConfirmButton: false });
            renderDaftarAdminKelas();
        }
    });
}

// ==== ADMIN UTAMA: TABEL & AKSI ====
function renderTabelAdmin() {
    const tbody = document.getElementById('tbody-rekap');
    tbody.innerHTML = "";
    if (dbAbsensi.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#999;">Belum ada data absensi yang masuk.</td></tr>`;
        return;
    }
    dbAbsensi.forEach(data => {
        let badgeClass = data.status === 'Hadir' ? 'badge-hadir' : 'badge-izin';
        let btnFoto = data.foto ? `<button class="btn-small btn-foto-small" onclick="lihatFotoPreview('${data.foto}')">Lihat</button>` : '-';
        let btnHapus = `<button class="btn-small btn-delete-small" onclick="hapusDataIndividu('${data.id}')">Hapus</button>`;
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${data.nama}</strong></td>
            <td>${data.kelas}</td>
            <td>${data.hari}</td>
            <td><span class="status-badge ${badgeClass}">${data.status}</span></td>
            <td>${btnFoto}</td>
            <td><span style="font-size:12px; color:#64748b; font-weight:600;">${data.waktuStr}</span></td>
            <td style="text-align: right;">${btnHapus}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function hapusDataIndividu(id) {
    const snap = await firebase.database().ref('absensi/' + id).once('value');
    const data = snap.val();
    Swal.fire({
        title: 'Hapus?',
        text: "Data absensi ini akan dihapus.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Ya'
    }).then(async (result) => {
        if (result.isConfirmed) {
            if (data && data.filePath) {
                await hapusFileDariSupabase(data.filePath);
            }
            await firebase.database().ref('absensi/' + id).remove();
            Swal.fire({ title: 'Terhapus!', text: 'Data berhasil dihapus.', icon: 'success' });
        }
    });
}

async function resetSemuaData() {
    Swal.fire({
        title: 'Yakin?',
        text: "Reset semua data absensi!",
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Ya!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const snap = await firebase.database().ref('absensi').once('value');
            const allData = snap.val() || {};
            const filePaths = Object.values(allData).map(d => d.filePath).filter(Boolean);
            if (filePaths.length > 0) {
                await supabaseClient.storage.from('foto-absensi').remove(filePaths);
            }
            await firebase.database().ref('absensi').remove();
            Swal.fire({ title: 'Direset!', text: 'Semua data dihapus.', icon: 'success' });
        }
    });
}

function downloadExcel() {
    if (dbAbsensi.length === 0) return Swal.fire({ title: 'Kosong', text: 'Belum ada yang absen.', icon: 'info', timer: 2500, timerProgressBar: true, showConfirmButton: false });
    const dataToExport = dbAbsensi.map(item => ({
        "Nama Siswa": item.nama,
        "Kelas": item.kelas,
        "Hari": item.hari,
        "Status": item.status,
        "Alasan": item.keterangan || "Bukti",
        "Tanggal & Jam": item.waktuStr
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Absen");
    XLSX.writeFile(workbook, "Rekap_Absensi_Semua.xlsx");
}

async function toggleStatusAbsensi() {
    const ref = firebase.database().ref('settings/status_absen');
    const snapshot = await ref.once('value');
    const currentStatus = snapshot.val();
    const isClosed = currentStatus === 'ditutup';
    const newStatus = isClosed ? 'dibuka' : 'ditutup';
    await ref.set(newStatus);
    if (newStatus === 'dibuka') {
        Swal.fire({ title: 'Absensi Dibuka', text: 'Siswa dapat melakukan absen.', icon: 'success', timer: 2500, timerProgressBar: true, showConfirmButton: false });
    } else {
        Swal.fire({ title: 'Absensi Ditutup', text: 'Siswa tidak bisa absen lagi.', icon: 'warning', timer: 2500, timerProgressBar: true, showConfirmButton: false });
    }
    updateTeksTombolBukaTutup();
}

async function updateTeksTombolBukaTutup() {
    const snapshot = await firebase.database().ref('settings/status_absen').once('value');
    const isClosed = snapshot.val() === 'ditutup';
    const btn = document.getElementById('btn-toggle-absen');
    if (isClosed) {
        btn.innerText = "Buka Absensi";
        btn.style.background = "#10b981";
        btn.style.color = "#fff";
    } else {
        btn.innerText = "Tutup Absensi";
        btn.style.background = "#f59e0b";
        btn.style.color = "#fff";
    }
}

async function cekDanBukaAbsen() {
    const snapshot = await firebase.database().ref('settings/status_absen').once('value');
    const isClosed = snapshot.val() === 'ditutup';
    if (isClosed) {
        Swal.fire({ title: 'Tidak bisa absen', text: 'Absensi telah ditutup.', icon: 'error', timer: 3000, timerProgressBar: true, showConfirmButton: false });
    } else {
        switchPanel('panel-absen');
    }
}

// ==== ADMIN KELAS: TABEL & AKSI ====
function renderTabelKelas() {
    const tbody = document.getElementById('tbody-rekap-kelas');
    const kelas = currentUser.kelas;
    const dataKelas = dbAbsensi.filter(item => item.kelas === kelas);
    if (dataKelas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#999;">Belum ada data untuk kelas ${kelas}.</td></tr>`;
        return;
    }
    tbody.innerHTML = "";
    dataKelas.forEach(data => {
        let badgeClass = data.status === 'Hadir' ? 'badge-hadir' : 'badge-izin';
        let btnFoto = data.foto ? `<button class="btn-small btn-foto-small" onclick="lihatFotoPreview('${data.foto}')">Lihat</button>` : '-';
        let btnHapus = `<button class="btn-small btn-delete-small" onclick="hapusDataIndividu('${data.id}')">Hapus</button>`;
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${data.nama}</strong></td>
            <td>${data.hari}</td>
            <td><span class="status-badge ${badgeClass}">${data.status}</span></td>
            <td>${btnFoto}</td>
            <td><span style="font-size:12px; color:#64748b; font-weight:600;">${data.waktuStr}</span></td>
            <td style="text-align: right;">${btnHapus}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function resetDataKelas() {
    const kelas = currentUser.kelas;
    Swal.fire({
        title: 'Yakin?',
        text: `Reset semua data absensi kelas ${kelas}!`,
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Ya!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const dataKelas = dbAbsensi.filter(item => item.kelas === kelas);
            const filePaths = dataKelas.map(d => d.filePath).filter(Boolean);
            if (filePaths.length > 0) {
                await supabaseClient.storage.from('foto-absensi').remove(filePaths);
            }
            for (const item of dataKelas) {
                await firebase.database().ref('absensi/' + item.id).remove();
            }
            Swal.fire({ title: 'Direset!', text: `Data kelas ${kelas} dihapus.`, icon: 'success' });
        }
    });
}

function downloadExcelKelas() {
    const kelas = currentUser.kelas;
    const dataKelas = dbAbsensi.filter(item => item.kelas === kelas);
    if (dataKelas.length === 0) return Swal.fire({ title: 'Kosong', text: 'Tidak ada data.', icon: 'info', timer: 2500, timerProgressBar: true, showConfirmButton: false });
    const dataToExport = dataKelas.map(item => ({
        "Nama Siswa": item.nama,
        "Hari": item.hari,
        "Status": item.status,
        "Alasan": item.keterangan || "Bukti",
        "Tanggal & Jam": item.waktuStr
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap " + kelas);
    XLSX.writeFile(workbook, `Rekap_Absensi_${kelas}.xlsx`);
}

// ==== MODAL KEHADIRAN ADMIN UTAMA ====
function bukaModalKehadiran() {
    openModal('modal-kehadiran');
    document.getElementById('filter-admin-kelas-val').value = "";
    document.getElementById('teks-admin-kelas').innerText = "Pilih Kelas...";
    document.getElementById('btn-admin-kelas').classList.remove('selected');
    document.getElementById('filter-admin-hari-val').value = "";
    document.getElementById('teks-admin-hari').innerText = "Pilih Hari...";
    document.getElementById('btn-admin-hari').classList.remove('selected');
    document.getElementById('filter-admin-status-val').value = "Semua";
    document.getElementById('teks-admin-status').innerText = "Semua";
    document.getElementById('btn-admin-status').classList.remove('selected');
    document.getElementById('tbody-filter-kehadiran').innerHTML = '<tr><td colspan="3" style="text-align:center; color:#888;">Silakan pilih Kelas dan Hari.</td></tr>';
    generateAdminKelasList();
}

function generateAdminKelasList() {
    const container = document.getElementById('list-admin-kelas-container');
    container.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const kelas = "XIF" + i;
        container.innerHTML += `<div class="modal-item" onclick="pilihAdminKelas('${kelas}')">${kelas}</div>`;
    }
}

function pilihAdminKelas(kelas) {
    document.getElementById('filter-admin-kelas-val').value = kelas;
    document.getElementById('teks-admin-kelas').innerText = kelas;
    document.getElementById('btn-admin-kelas').classList.add('selected');
    closeModal('modal-admin-kelas');
    renderTabelKehadiran();
}

function pilihAdminHari(hari) {
    document.getElementById('filter-admin-hari-val').value = hari;
    document.getElementById('teks-admin-hari').innerText = hari;
    document.getElementById('btn-admin-hari').classList.add('selected');
    closeModal('modal-admin-hari');
    renderTabelKehadiran();
}

function pilihAdminStatus(status) {
    document.getElementById('filter-admin-status-val').value = status;
    document.getElementById('teks-admin-status').innerText = status;
    document.getElementById('btn-admin-status').classList.add('selected');
    closeModal('modal-admin-status');
    renderTabelKehadiran();
}

function renderTabelKehadiran() {
    const adminFilterKelas = document.getElementById('filter-admin-kelas-val').value;
    const adminFilterHari = document.getElementById('filter-admin-hari-val').value;
    const adminFilterStatus = document.getElementById('filter-admin-status-val').value;
    const tbody = document.getElementById('tbody-filter-kehadiran');

    if (!adminFilterKelas || !adminFilterHari) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#888;">Silakan pilih Kelas dan Hari.</td></tr>';
        return;
    }

    const dbFiltered = dbAbsensi.filter(item => item.kelas === adminFilterKelas && item.hari === adminFilterHari);
    const daftarNama = daftarNamaPerKelas[adminFilterKelas] || [];
    let hasilAkhir = [];
    daftarNama.forEach(nama => {
        let record = dbFiltered.find(item => item.nama === nama);
        if (record) hasilAkhir.push({ nama, status: record.status, keterangan: record.keterangan, foto: record.foto });
        else hasilAkhir.push({ nama, status: 'Belum Absen', keterangan: '-', foto: null });
    });
    if (adminFilterStatus !== 'Semua') {
        hasilAkhir = hasilAkhir.filter(item => item.status === adminFilterStatus);
    }
    tbody.innerHTML = "";
    if (hasilAkhir.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#888;">Tidak ada data pada kategori ini.</td></tr>`;
        return;
    }
    hasilAkhir.forEach(item => {
        let badgeClass = item.status === 'Hadir' ? 'badge-hadir' : (item.status === 'Izin' ? 'badge-izin' : 'badge-belum');
        let btnFoto = item.foto ? `<button class="btn-small btn-foto-small" onclick="lihatFotoPreview('${item.foto}')">Lihat</button>` : '-';
        let infoKet = item.keterangan !== "-" ? `<div style="font-size:12px; color:#666; margin-top:5px; font-weight:500;">${item.keterangan}</div>` : '';
        tbody.innerHTML += `
            <tr>
                <td><strong>${item.nama}</strong></td>
                <td><span class="status-badge ${badgeClass}">${item.status}</span></td>
                <td>${btnFoto} ${infoKet}</td>
            </tr>
        `;
    });
}

// ==== MODAL KEHADIRAN ADMIN KELAS ====
function bukaModalKehadiranKelas() {
    openModal('modal-kehadiran-kelas');
    document.getElementById('filter-kelas-hari-val').value = "";
    document.getElementById('teks-kelas-hari').innerText = "Pilih Hari...";
    document.getElementById('btn-kelas-hari').classList.remove('selected');
    document.getElementById('tbody-filter-kelas').innerHTML = '<tr><td colspan="3" style="text-align:center; color:#888;">Silakan pilih Hari.</td></tr>';
}

function pilihKelasHari(hari) {
    document.getElementById('filter-kelas-hari-val').value = hari;
    document.getElementById('teks-kelas-hari').innerText = hari;
    document.getElementById('btn-kelas-hari').classList.add('selected');
    closeModal('modal-kelas-hari');
    renderTabelKehadiranKelas();
}

function renderTabelKehadiranKelas() {
    const kelas = currentUser.kelas;
    const hari = document.getElementById('filter-kelas-hari-val').value;
    const tbody = document.getElementById('tbody-filter-kelas');
    if (!hari) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#888;">Silakan pilih Hari.</td></tr>';
        return;
    }
    const dbFiltered = dbAbsensi.filter(item => item.kelas === kelas && item.hari === hari);
    const daftarNama = daftarNamaPerKelas[kelas] || [];
    let hasilAkhir = [];
    daftarNama.forEach(nama => {
        let record = dbFiltered.find(item => item.nama === nama);
        if (record) hasilAkhir.push({ nama, status: record.status, keterangan: record.keterangan, foto: record.foto });
        else hasilAkhir.push({ nama, status: 'Belum Absen', keterangan: '-', foto: null });
    });
    tbody.innerHTML = "";
    hasilAkhir.forEach(item => {
        let badgeClass = item.status === 'Hadir' ? 'badge-hadir' : (item.status === 'Izin' ? 'badge-izin' : 'badge-belum');
        let btnFoto = item.foto ? `<button class="btn-small btn-foto-small" onclick="lihatFotoPreview('${item.foto}')">Lihat</button>` : '-';
        let infoKet = item.keterangan !== "-" ? `<div style="font-size:12px; color:#666; margin-top:5px; font-weight:500;">${item.keterangan}</div>` : '';
        tbody.innerHTML += `
            <tr>
                <td><strong>${item.nama}</strong></td>
                <td><span class="status-badge ${badgeClass}">${item.status}</span></td>
                <td>${btnFoto} ${infoKet}</td>
            </tr>
        `;
    });
}

function lihatFotoPreview(url) {
    document.getElementById('preview-image-src').src = url;
    openModal('modal-preview-foto');
}

// ==== PANEL ABSEN SISWA ====
function generateKelasList() {
    const container = document.getElementById('list-kelas-container');
    container.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const kelas = "XIF" + i;
        container.innerHTML += `<div class="modal-item" onclick="pilihKelas('${kelas}')">${kelas}</div>`;
    }
}
generateKelasList();

function pilihKelas(kelas) {
    document.getElementById('kelas').value = kelas;
    document.getElementById('teks-kelas').innerText = kelas;
    document.getElementById('btn-pilih-kelas').classList.add('selected');
    document.getElementById('hari').value = "";
    document.getElementById('teks-hari').innerText = "Pilih hari kehadiran...";
    document.getElementById('btn-pilih-hari').classList.remove('selected');
    document.getElementById('nama-terpilih').value = "";
    document.getElementById('search-nama').value = "";
    closeModal('modal-kelas');
    renderNama("");
}

function pilihHari(hari) {
    document.getElementById('hari').value = hari;
    document.getElementById('teks-hari').innerText = hari;
    document.getElementById('btn-pilih-hari').classList.add('selected');
    document.getElementById('nama-terpilih').value = "";
    document.getElementById('search-nama').value = "";
    closeModal('modal-hari');
    renderNama("");
}

function renderNama(filterText = "") {
    const listContainer = document.getElementById('list-nama');
    const kelas = document.getElementById('kelas').value;
    const hari = document.getElementById('hari').value;
    listContainer.innerHTML = "";
    if (!kelas) {
        listContainer.innerHTML = `<div class="name-item disabled" style="text-align:center; color:#94a3b8; padding: 20px;">Pilih kelas terlebih dahulu.</div>`;
        return;
    }
    const daftarNama = daftarNamaPerKelas[kelas] || [];
    const filtered = daftarNama.filter(nama => nama.toLowerCase().includes(filterText.toLowerCase()));
    if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="name-item disabled" style="text-align:center; color:#94a3b8; padding: 20px;">Siswa tidak ditemukan.</div>`;
        return;
    }
    let sudahAbsenMap = new Set();
    if (hari) {
        dbAbsensi.forEach(record => {
            if (record.kelas === kelas && record.hari === hari) sudahAbsenMap.add(record.nama);
        });
    }
    filtered.forEach(nama => {
        let div = document.createElement('div');
        div.className = 'name-item';
        const sudahAbsen = sudahAbsenMap.has(nama);
        if (sudahAbsen) {
            div.innerHTML = `${nama} <span style="float:right; color:#10b981; font-weight:700;">✓ Tercatat</span>`;
            div.classList.add('disabled');
        } else {
            div.innerText = nama;
            if (nama === document.getElementById('nama-terpilih').value) div.classList.add('terpilih');
            div.onclick = () => {
                document.getElementById('nama-terpilih').value = nama;
                document.getElementById('search-nama').value = nama;
                renderNama(nama);
            };
        }
        listContainer.appendChild(div);
    });
}
renderNama();

function filterNama() {
    renderNama(document.getElementById('search-nama').value);
}

// ==== KAMERA & STATUS ====
function ubahStatus(status) {
    document.getElementById('label-hadir').classList.remove('active-hadir');
    document.getElementById('label-izin').classList.remove('active-izin');
    document.getElementById('area-dinamis').classList.remove('hidden');
    if (status === 'Hadir') {
        document.getElementById('label-hadir').classList.add('active-hadir');
        document.getElementById('area-izin').classList.add('hidden');
        document.getElementById('area-kamera').classList.remove('hidden');
        mulaiKamera();
    } else {
        document.getElementById('label-izin').classList.add('active-izin');
        document.getElementById('area-kamera').classList.add('hidden');
        document.getElementById('area-izin').classList.remove('hidden');
        matikanKamera();
    }
}

async function mulaiKamera() {
    try {
        streamKamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        document.getElementById('video-kamera').srcObject = streamKamera;
        document.getElementById('video-kamera').classList.remove('hidden');
        document.getElementById('canvas-kamera').classList.add('hidden');
        document.getElementById('btn-capture').classList.remove('hidden');
        document.getElementById('btn-retake').classList.add('hidden');
    } catch (err) {
        Swal.fire({ title: 'Akses Ditolak', text: 'Izinkan browser menggunakan kamera untuk verifikasi.', icon: 'error', timer: 3000, timerProgressBar: true, showConfirmButton: false });
    }
}

function matikanKamera() {
    if (streamKamera) streamKamera.getTracks().forEach(track => track.stop());
}

function takeSnapshot() {
    const video = document.getElementById('video-kamera');
    const canvas = document.getElementById('canvas-kamera');
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    document.getElementById('foto-data').value = canvas.toDataURL('image/jpeg', 0.8);
    video.classList.add('hidden');
    canvas.classList.remove('hidden');
    document.getElementById('btn-capture').classList.add('hidden');
    document.getElementById('btn-retake').classList.remove('hidden');
}

function retakePhoto() {
    document.getElementById('foto-data').value = "";
    document.getElementById('video-kamera').classList.remove('hidden');
    document.getElementById('canvas-kamera').classList.add('hidden');
    document.getElementById('btn-capture').classList.remove('hidden');
    document.getElementById('btn-retake').classList.add('hidden');
}

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

async function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// ==== KIRIM ABSEN ====
async function kirimAbsen() {
    const kelas = document.getElementById('kelas').value;
    const hari = document.getElementById('hari').value;
    const nama = document.getElementById('nama-terpilih').value;
    const statusEl = document.querySelector('input[name="status"]:checked');
    const status = statusEl ? statusEl.value : null;

    if (!kelas || !hari || !nama || !status) return Swal.fire({ title: 'Gagal', text: 'Isi semua data.', icon: 'warning', timer: 2500, timerProgressBar: true, showConfirmButton: false });

    let fotoSimpan = "";
    let keterangan = "-";

    if (status === 'Hadir') {
        fotoSimpan = document.getElementById('foto-data').value;
        if (!fotoSimpan) return Swal.fire({ title: 'Bukti Diperlukan', text: 'Ambil Foto.', icon: 'warning', timer: 2500, timerProgressBar: true, showConfirmButton: false });
    } else if (status === 'Izin') {
        keterangan = document.getElementById('keterangan-izin').value.trim();
        const fileSurat = document.getElementById('surat-izin').files;
        if (keterangan.length < 5) return Swal.fire({ title: 'Ditolak', text: 'Isi alasan terlebih dahulu', icon: 'warning', timer: 2500, timerProgressBar: true, showConfirmButton: false });
        if (fileSurat.length === 0) return Swal.fire({ title: 'Surat Diperlukan', text: 'Unggah foto bukti surat izin.', icon: 'warning', timer: 2500, timerProgressBar: true, showConfirmButton: false });
        fotoSimpan = await getBase64(fileSurat[0]);
    }

    const timeNow = new Date();
    const uniqueId = "ID_" + timeNow.getTime() + "_" + Math.random().toString(36).substr(2, 5);
    const waktuStr = timeNow.toLocaleString('id-ID');

    let publicUrl = '';
    let fileName = '';
    if (fotoSimpan) {
        const blob = dataURLtoBlob(fotoSimpan);
        const fileExt = 'jpg';
        fileName = `absensi_${uniqueId}.${fileExt}`;
        const { error: uploadError } = await supabaseClient.storage
            .from('foto-absensi')
            .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) {
            console.error('Upload gagal:', uploadError);
            Swal.fire({ title: 'Gagal', text: 'Gagal mengunggah bukti.', icon: 'error', timer: 2500, timerProgressBar: true, showConfirmButton: false });
            return;
        }
        const { data: publicUrlData } = supabaseClient.storage.from('foto-absensi').getPublicUrl(fileName);
        publicUrl = publicUrlData.publicUrl;
    }

    const payload = {
        kelas: kelas,
        hari: hari,
        nama: nama,
        status: status,
        keterangan: keterangan,
        foto: publicUrl,
        filePath: fileName,
        waktuStr: waktuStr,
        lockKey: `absen_${kelas}_${nama}_${hari}`
    };

    await firebase.database().ref('absensi/' + uniqueId).set(payload);

    Swal.fire({ title: 'Berhasil!', text: `${nama} telah absen.`, icon: 'success', timer: 2500, timerProgressBar: true, showConfirmButton: false })
        .then(() => {
            document.getElementById('nama-terpilih').value = "";
            document.getElementById('search-nama').value = "";
            document.querySelector('input[name="status"]:checked').checked = false;
            document.getElementById('area-dinamis').classList.add('hidden');
            document.getElementById('label-hadir').classList.remove('active-hadir');
            document.getElementById('label-izin').classList.remove('active-izin');
            document.getElementById('surat-izin').value = "";
            matikanKamera();
        });
}

async function hapusFileDariSupabase(filePath) {
    if (!filePath) return;
    try {
        const { error } = await supabaseClient.storage.from('foto-absensi').remove([filePath]);
        if (error) console.warn('Gagal hapus file:', error);
    } catch (err) {
        console.warn('Error hapus file:', err);
    }
}

// ==== NAVIGASI PANEL ====
function switchPanel(panelId, isAdminPanel = false) {
    const currentActive = document.querySelector('.panel.active');
    const mainContainer = document.getElementById('main-container');
    if (isAdminPanel) mainContainer.classList.add('admin-mode');
    else mainContainer.classList.remove('admin-mode');

    if (currentActive) {
        currentActive.style.opacity = 0;
        currentActive.style.transform = 'scale(0.97) translateY(15px)';
        setTimeout(() => {
            currentActive.classList.remove('active');
            const newPanel = document.getElementById(panelId);
            newPanel.classList.add('active');
            void newPanel.offsetWidth;
            newPanel.style.opacity = 1;
            newPanel.style.transform = 'scale(1) translateY(0)';
        }, 400);
    } else {
        const newPanel = document.getElementById(panelId);
        newPanel.classList.add('active');
        newPanel.style.opacity = 1;
        newPanel.style.transform = 'scale(1) translateY(0)';
    }

    if (panelId === 'panel-awal') matikanKamera();
}

function openModal(id) {
    document.getElementById(id).classList.add('show');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

// Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

// Inisialisasi tampilan
renderNama();
