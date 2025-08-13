import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, query, onSnapshot, where, getDocs, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBcPDSvX0ZC_a7MJjP9sc79pA7jW2i1Gzg",
  authDomain: "hospital-bookingv2.firebaseapp.com",
  projectId: "hospital-bookingv2",
  storageBucket: "hospital-bookingv2.firebasestorage.app",
  messagingSenderId: "716206636949",
  appId: "1:716206636949:web:64d809f311943a5873809c",
  measurementId: "G-8T40X2TZM2"
};

const app = initializeApp(firebaseConfig);
const appId = 'hospital-booking-app-local';
let db, auth;
let currentUserId = null;
let currentUserProfile = null;
let unsubscribeDoctorAppointments = null;

const publicAppointmentsPath = `artifacts/${appId}/public/data/appointments`;
const userProfilesPath = `artifacts/${appId}/users`;

// --- UI ELEMENT REFERENCES ---
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginFormContainer = document.getElementById('login-form-container');
const signupFormContainer = document.getElementById('signup-form-container');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const showSignupBtn = document.getElementById('show-signup');
const showLoginBtn = document.getElementById('show-login');
const signoutBtn = document.getElementById('signout-btn');
const patientDashboard = document.getElementById('patient-dashboard');
const doctorDashboard = document.getElementById('doctor-dashboard');
const welcomeMessage = document.getElementById('welcome-message');
const doctorNameField = document.getElementById('doctor-name-field');
const roleSelection = document.getElementById('role-selection');
const doctorAppointmentsListDiv = document.getElementById('doctor-appointments-list');

// --- AUTHENTICATION LOGIC ---
db = getFirestore(app);
auth = getAuth(app);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        const profileDocRef = doc(db, userProfilesPath, currentUserId, 'profile', 'data');
        const profileDoc = await getDoc(profileDocRef);
        
        if (profileDoc.exists()) {
            currentUserProfile = profileDoc.data();
            welcomeMessage.textContent = `Welcome, ${currentUserProfile.name || currentUserProfile.email}`;
            
            if (currentUserProfile.role === 'doctor') {
                doctorDashboard.classList.remove('hidden');
                patientDashboard.classList.add('hidden');
                setupDoctorDashboard(currentUserProfile.name);
            } else {
                patientDashboard.classList.remove('hidden');
                doctorDashboard.classList.add('hidden');
                setupAppointmentListener();
                renderDoctorAvailability();
                initializeDateTimeControls();
            }
            
            authContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
        } else {
            await signOut(auth);
        }
    } else {
        currentUserId = null;
        currentUserProfile = null;
        if (unsubscribeDoctorAppointments) unsubscribeDoctorAppointments();
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try { await signInWithEmailAndPassword(auth, email, password); } catch (error) { alert(`Login Failed: ${error.message}`); }
});

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const role = document.querySelector('input[name="role"]:checked').value;
    const name = document.getElementById('signup-name').value;

    if (role === 'doctor' && !name) {
        alert('Please select your doctor profile.');
        return;
    }
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const profileDocRef = doc(db, userProfilesPath, user.uid, 'profile', 'data');
        await setDoc(profileDocRef, { role, email: user.email, name: role === 'doctor' ? name : '' });
    } catch (error) { alert(`Sign-Up Failed: ${error.message}`); }
});

roleSelection.addEventListener('change', (e) => {
   if (e.target.value === 'doctor') {
       doctorNameField.classList.remove('hidden');
       document.getElementById('signup-name').required = true;
   } else {
       doctorNameField.classList.add('hidden');
       document.getElementById('signup-name').required = false;
   }
});

signoutBtn.addEventListener('click', async () => { await signOut(auth); });
showSignupBtn.addEventListener('click', (e) => { e.preventDefault(); loginFormContainer.classList.add('hidden'); signupFormContainer.classList.remove('hidden'); });
showLoginBtn.addEventListener('click', (e) => { e.preventDefault(); signupFormContainer.classList.add('hidden'); loginFormContainer.classList.remove('hidden'); });

// --- DOCTOR DASHBOARD LOGIC ---
function setupDoctorDashboard(doctorName) {
   const q = query(
       collection(db, publicAppointmentsPath), 
       where("doctor", "==", doctorName),
       where("status", "!=", "finished")
   );

   unsubscribeDoctorAppointments = onSnapshot(q, (querySnapshot) => {
       const appointments = [];
       querySnapshot.forEach((doc) => {
           appointments.push({ id: doc.id, ...doc.data() });
       });
       
       appointments.sort((a, b) => new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`));
       renderDoctorAppointments(appointments, doctorAppointmentsListDiv);
   });
}

function renderDoctorAppointments(appointments, container) {
   if (appointments.length === 0) {
       container.innerHTML = `<p class="text-gray-500 text-center py-8">You have no upcoming appointments.</p>`;
       return;
   }

   container.innerHTML = appointments.map(app => {
       const dateParts = app.date.split('-');
       const formattedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).toLocaleDateString('en-US', {
           weekday: 'long', month: 'long', day: 'numeric'
       });

       return `
           <div class="p-4 border rounded-lg bg-gray-50 flex justify-between items-center">
               <div>
                   <p class="font-semibold text-teal-700">${app.patientName}</p>
                   <p class="text-sm text-gray-600">${formattedDate} at ${app.time}</p>
               </div>
               <button data-id="${app.id}" class="finish-btn btn btn-success !py-1 !px-3">
                   <ion-icon name="checkmark-done-outline"></ion-icon>
                   Finish
               </button>
           </div>
       `;
   }).join('');
}

// Event listener for the finish button
doctorAppointmentsListDiv.addEventListener('click', async (e) => {
   if (e.target && e.target.closest('.finish-btn')) {
       const button = e.target.closest('.finish-btn');
       const docId = button.dataset.id;
       
       button.disabled = true;
       button.innerHTML = 'Finishing...';

       const docRef = doc(db, publicAppointmentsPath, docId);
       try {
           await updateDoc(docRef, {
               status: 'finished'
           });
       } catch (error) {
           console.error("Error finishing appointment: ", error);
           alert("Could not update appointment status.");
           button.disabled = false;
           button.innerHTML = '<ion-icon name="checkmark-done-outline"></ion-icon> Finish';
       }
   }
});

// --- PATIENT DASHBOARD & PROFILE LOGIC ---
const bookingFolder = document.getElementById('booking-folder');
const bookingFolderHeader = document.getElementById('booking-folder-header');
const bookingForm = document.getElementById('booking-form');
const appointmentsList = document.getElementById('appointments-list');
const submitBtn = document.getElementById('submit-btn');
const profileBtn = document.getElementById('profile-btn');
const profileModal = document.getElementById('profile-modal');
const closeProfileModalBtn = document.getElementById('close-profile-modal-btn');
const profileForm = document.getElementById('profile-form');

bookingFolderHeader.addEventListener('click', () => bookingFolder.classList.toggle('open'));
profileBtn.addEventListener('click', openProfileModal);
closeProfileModalBtn.addEventListener('click', () => profileModal.classList.add('hidden'));
profileForm.addEventListener('submit', saveProfile);

bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) { alert("Authentication in progress. Please wait."); return; }
    const patientName = document.getElementById('patient-name').value;
    const doctor = document.getElementById('doctor').value;
    const date = document.getElementById('appointment-date').value;
    const time = document.getElementById('appointment-time').value;
    if (!patientName || !doctor || !date || !time) { alert("Please fill out all fields."); return; }
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<ion-icon name="hourglass-outline" class="animate-spin"></ion-icon> Booking...';
    try {
        const conflictQuery = query(collection(db, publicAppointmentsPath), where("doctor", "==", doctor), where("date", "==", date), where("time", "==", time));
        const conflictSnapshot = await getDocs(conflictQuery);
        if (!conflictSnapshot.empty) { alert("This time slot is already booked. Please choose a different time."); return; }
        await addDoc(collection(db, publicAppointmentsPath), { patientName, doctor, date, time, bookedBy: currentUserId, createdAt: new Date(), status: 'upcoming' });
        bookingForm.reset();
        bookingFolder.classList.remove('open');
    } catch (error) { console.error("Error adding document: ", error); alert("Failed to book appointment."); } finally { submitBtn.disabled = false; submitBtn.innerHTML = '<ion-icon name="add-circle-outline"></ion-icon> Book Appointment'; }
});

appointmentsList.addEventListener('click', async (e) => {
    const cancelButton = e.target.closest('.cancel-btn');
    if (cancelButton) {
        const docId = cancelButton.dataset.id;
        if (confirm('Are you sure you want to cancel this appointment?')) {
             try { await deleteDoc(doc(db, publicAppointmentsPath, docId)); } catch (error) { console.error("Error cancelling appointment: ", error); alert("Failed to cancel appointment."); }
        }
    }
});

async function openProfileModal() {
   if (!currentUserId || !currentUserProfile) return;
   document.getElementById('profile-email').value = currentUserProfile.email;
   document.getElementById('profile-phone').value = currentUserProfile.phone || '';
   document.getElementById('profile-name').value = currentUserProfile.name || 'Patient';
   
   const q = query(collection(db, publicAppointmentsPath), where("bookedBy", "==", currentUserId));
   const appointmentSnapshot = await getDocs(q);
   const allAppointments = [];
   appointmentSnapshot.forEach(doc => { allAppointments.push({ id: doc.id, ...doc.data() }); });
   renderBookingHistory(allAppointments);
   profileModal.classList.remove('hidden');
}

async function saveProfile(e) {
   e.preventDefault();
   if (!currentUserId) return;
   const phone = document.getElementById('profile-phone').value;
   const profileDocRef = doc(db, userProfilesPath, currentUserId, 'profile', 'data');
   try { await setDoc(profileDocRef, { phone }, { merge: true }); alert('Profile updated successfully!'); profileModal.classList.add('hidden'); } catch (error) { console.error("Error saving profile: ", error); alert('Failed to save profile.'); }
}

function renderBookingHistory(appointments) {
   const historyContainer = document.getElementById('history-content');
   if (appointments.length === 0) { historyContainer.innerHTML = `<p class="text-gray-500 text-center">No booking history found.</p>`; return; }
   appointments.sort((a, b) => new Date(b.date) - new Date(a.date));
   historyContainer.innerHTML = appointments.map(app => { 
       const dateParts = app.date.split('-'); 
       const formattedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); 
       const status = app.status === 'finished' ? 
           '<span class="text-xs font-medium bg-green-100 text-green-800 px-2 py-1 rounded-full">Finished</span>' : 
           '<span class="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Upcoming</span>';
       
       return `
           <div class="p-3 bg-gray-50 rounded-lg flex justify-between items-center">
               <div>
                   <p class="font-semibold text-gray-800">${app.doctor}</p>
                   <p class="text-sm text-gray-600">${formattedDate} at ${app.time}</p>
               </div>
               ${status}
           </div>`; 
   }).join('');
}

const detailsTab = document.getElementById('details-tab'), historyTab = document.getElementById('history-tab'), detailsContent = document.getElementById('details-content'), historyContent = document.getElementById('history-content');
detailsTab.addEventListener('click', () => { detailsTab.classList.add('active'); historyTab.classList.remove('active'); detailsContent.classList.add('active'); historyContent.classList.remove('active'); });
historyTab.addEventListener('click', () => { historyTab.classList.add('active'); detailsTab.classList.remove('active'); historyContent.classList.add('active'); detailsContent.classList.remove('active'); });

function setupAppointmentListener() {
    if (!currentUserId) return;
    const q = query(collection(db, publicAppointmentsPath), where("bookedBy", "==", currentUserId), where("status", "!=", "finished"));
    onSnapshot(q, (querySnapshot) => { const appointments = []; querySnapshot.forEach((doc) => appointments.push({ id: doc.id, ...doc.data() })); appointments.sort((a, b) => new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`)); renderAppointments(appointments); });
}
function renderAppointments(appointments) {
    if (appointments.length === 0) { appointmentsList.innerHTML = `<div class="text-center py-10 px-6"><svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-20 w-20 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><h3 class="mt-4 text-lg font-semibold text-gray-800">No appointments scheduled</h3><p class="mt-1 text-gray-500">Your booked appointments will appear here.</p></div>`; return; }
    appointmentsList.innerHTML = '';
    appointments.forEach(app => { const appointmentEl = document.createElement('div'); appointmentEl.className = 'p-5 border-l-4 border-teal-400 bg-teal-50 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'; const dateParts = app.date.split('-'); const formattedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); appointmentEl.innerHTML = `<div class="flex-grow"><p class="font-bold text-lg text-teal-800">${app.patientName}</p><p class="text-md text-gray-700 font-medium">${app.doctor}</p><div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-gray-600"><div class="flex items-center gap-1.5"><ion-icon name="calendar-clear-outline"></ion-icon><span>${formattedDate}</span></div><div class="flex items-center gap-1.5"><ion-icon name="alarm-outline"></ion-icon><span>${app.time}</span></div></div></div><div class="flex-shrink-0 w-full sm:w-auto"><button data-id="${app.id}" class="cancel-btn btn btn-danger-outline w-full sm:w-auto"><ion-icon name="trash-outline"></ion-icon>Cancel</button></div>`; appointmentsList.appendChild(appointmentEl); });
}
function renderDoctorAvailability() {
   const availabilityList = document.getElementById('doctor-availability-list'); const today = new Date().getDay(); const doctors = [{ name: "Dr. Emily Carter (Cardiologist)", daysOff: [0, 6] }, { name: "Dr. Ben Hanna (Dermatologist)", daysOff: [3] }, { name: "Dr. Olivia Chen (Pediatrician)", daysOff: [5] }];
   availabilityList.innerHTML = '';
   doctors.forEach(doctor => { const docEl = document.createElement('div'); docEl.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg'; const isAvailable = !doctor.daysOff.includes(today); const statusColor = isAvailable ? 'bg-green-400' : 'bg-red-400'; const statusText = isAvailable ? 'Available Today' : 'On Leave'; docEl.innerHTML = `<div><p class="font-semibold text-gray-800">${doctor.name.split('(')[0].trim()}</p><p class="text-sm text-gray-500">${doctor.name.split('(')[1].replace(')','')}</p></div><div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full ${statusColor}"></div><span class="text-sm font-medium text-gray-600">${statusText}</span></div>`; availabilityList.appendChild(docEl); });
}
function initializeDateTimeControls() {
   const dateInput = document.getElementById('appointment-date'); const today = new Date(); const yyyy = today.getFullYear(); const mm = String(today.getMonth() + 1).padStart(2, '0'); const dd = String(today.getDate()).padStart(2, '0');
   dateInput.setAttribute('min', `${yyyy}-${mm}-${dd}`); dateInput.addEventListener('change', updateAvailableTimes); updateAvailableTimes();
}
function updateAvailableTimes() {
   const dateInput = document.getElementById('appointment-date'); const timeSelect = document.getElementById('appointment-time'); const selectedDateStr = dateInput.value;
   if (!selectedDateStr) { for (const option of timeSelect.options) { option.style.display = 'block'; } return; }
   const selectedDate = new Date(selectedDateStr + 'T00:00:00'); const now = new Date(); const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
   timeSelect.value = ''; for (const option of timeSelect.options) { option.style.display = 'block'; }
   if (selectedDate.getTime() === todayDate.getTime()) {
       const currentHour = now.getHours();
       for (const option of timeSelect.options) {
           if (option.value) { let [hour, period] = option.value.split(/[: ]/); hour = parseInt(hour, 10); if (period.toLowerCase() === 'pm' && hour !== 12) { hour += 12; } if (period.toLowerCase() === 'am' && hour === 12) { hour = 0; } if (hour <= currentHour) { option.style.display = 'none'; } }
       }
   }
}
