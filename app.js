const demoDoctors=[
  {id:'dr-anika-rao',name:'Dr. Anika Rao',initials:'AR',specialty:'Cardiology',experience:'12 years experience',rating:'4.9',next:'Today, 2:30 PM',fee:'₹800',color:'avatar-green'},
  {id:'dr-rahul-mehta',name:'Dr. Rahul Mehta',initials:'RM',specialty:'Dermatology',experience:'9 years experience',rating:'4.8',next:'Today, 4:00 PM',fee:'₹650',color:'avatar-coral'},
  {id:'dr-sana-kapoor',name:'Dr. Sana Kapoor',initials:'SK',specialty:'Neurology',experience:'14 years experience',rating:'5.0',next:'Tomorrow, 9:30 AM',fee:'₹1,000',color:'avatar-blue'},
  {id:'dr-isha-nair',name:'Dr. Isha Nair',initials:'IN',specialty:'Orthopedics',experience:'11 years experience',rating:'4.9',next:'Tomorrow, 11:00 AM',fee:'₹750',color:'avatar-purple'},
  {id:'dr-kabir-sen',name:'Dr. Kabir Sen',initials:'KS',specialty:'Pediatrics',experience:'8 years experience',rating:'4.9',next:'Today, 3:15 PM',fee:'₹600',color:'avatar-gold'},
  {id:'dr-meera-joshi',name:'Dr. Meera Joshi',initials:'MJ',specialty:'General Medicine',experience:'10 years experience',rating:'4.8',next:'Today, 5:00 PM',fee:'₹500',color:'avatar-rose'}
];
let doctors=[...demoDoctors];

const doctorGrid=document.querySelector('#doctor-grid');
const bookingModal=document.querySelector('#booking-modal');
const resultModal=document.querySelector('#result-modal');
const appointmentsModal=document.querySelector('#appointments-modal');
const managementModal=document.querySelector('#management-modal');
const specialtySelect=document.querySelector('#booking-specialty');
const doctorSelect=document.querySelector('#booking-doctor');
const dateInput=document.querySelector('#booking-date');
const timeSelect=document.querySelector('#booking-time');
const form=document.querySelector('#booking-form');
let availabilityRequest=0;

async function apiRequest(url,options={}){
  let response;
  try{response=await fetch(url,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}})}
  catch{throw new Error('Cannot reach the appointment server. Run “npm start” and open http://localhost:3000.')}
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'The server could not complete your request.');
  return result;
}

function renderDoctors(filter=''){
  const matched=doctors.filter(doctor=>!filter||doctor.specialty===filter);
  doctorGrid.innerHTML=matched.length?matched.map(doctor=>`<article class="doctor-card">
    <div class="doctor-top"><div class="doctor-avatar ${doctor.color}" aria-hidden="true">${doctor.initials}</div><div><div class="doctor-name">${doctor.name}</div><div class="doctor-specialty">${doctor.specialty}</div></div><div class="doctor-rating">★ <b>${doctor.rating}</b></div></div>
    <div class="doctor-info"><span>◷ <b>${doctor.experience}</b></span><span>₹ <b>${doctor.fee.replace('₹','')}</b> consultation</span></div>
    <div class="doctor-bottom"><div class="doctor-next">Next available<strong>${doctor.next}</strong></div><button class="doctor-book" data-book-doctor="${doctor.id}">Book a visit ↗</button></div>
  </article>`).join(''):'<p class="empty-doctors">No doctors are available right now. Start the Carewell server and refresh this page.</p>';
}

function refreshDoctorOptions(preferredId=''){
  const specialty=specialtySelect.value;
  const eligible=doctors.filter(doctor=>!specialty||doctor.specialty===specialty);
  doctorSelect.innerHTML='<option value="">Select a doctor</option>'+eligible.map(doctor=>`<option value="${doctor.id}">${doctor.name} · ${doctor.specialty}</option>`).join('');
  if(preferredId&&eligible.some(doctor=>doctor.id===preferredId))doctorSelect.value=preferredId;
}

async function refreshAvailability(){
  const requestId=++availabilityRequest;
  const doctor=doctorSelect.value,date=dateInput.value;
  if(!doctor||!date){timeSelect.innerHTML='<option value="">Choose a doctor and date</option>';timeSelect.disabled=true;return}
  timeSelect.innerHTML='<option value="">Loading times…</option>';timeSelect.disabled=true;
  try{
    const query=new URLSearchParams({doctor,date});
    const times=await apiRequest(`/api/availability?${query}`);
    if(requestId!==availabilityRequest)return;
    timeSelect.innerHTML=times.length?'<option value="">Select a time</option>'+times.map(time=>`<option>${time}</option>`).join(''):'<option value="">No times left for this date</option>';
    timeSelect.disabled=!times.length;
  }catch(error){
    if(requestId!==availabilityRequest)return;
    timeSelect.innerHTML='<option value="">Start server to load times</option>';timeSelect.disabled=true;
  }
}

function openBooking({specialty='',doctorId='',date=''}={}){
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  specialtySelect.value=specialty;
  refreshDoctorOptions(doctorId);
  dateInput.value=date||localToday;
  refreshAvailability();
  bookingModal.showModal();
  document.body.classList.add('modal-open');
}

function closeDialog(dialog){dialog.close();if(!document.querySelector('dialog[open]'))document.body.classList.remove('modal-open');}
function formatDate(dateString){if(!dateString)return '';return new Date(`${dateString}T12:00:00`).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}
function fillReceipt(appointment){
  document.querySelector('#result-copy').textContent=`Thanks, ${appointment.patientName}. Your appointment is booked.`;
  document.querySelector('#appointment-receipt').innerHTML=[
    ['Doctor',appointment.doctorName],
    ['Specialty',appointment.specialty],
    ['Date & time',`${formatDate(appointment.date)} · ${appointment.time}`],
    ['Booking reference',`<span class="reference-code">${appointment.confirmationCode}</span>`]
  ].map(([label,value])=>`<div class="receipt-row"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function showAppointment(appointment){
  const host=document.querySelector('#appointments-list');
  const card=document.createElement('div');card.className='appointment-item';
  const doctor=document.createElement('strong');doctor.textContent=appointment.doctorName;
  const details=document.createElement('span');details.textContent=`${appointment.specialty} · ${formatDate(appointment.date)} at ${appointment.time}`;
  const patient=document.createElement('span');patient.textContent=`Booked for ${appointment.patientName} · ${appointment.status}`;
  const reference=document.createElement('span');reference.textContent=`Reference: ${appointment.confirmationCode}`;
  card.append(doctor,details,patient,reference);host.replaceChildren(card);
}

function showFormError(id,message){const error=document.querySelector(id);error.textContent=message;error.hidden=false;}
function clearFormError(id){const error=document.querySelector(id);error.textContent='';error.hidden=true;}

function renderManagementRows(appointments){
  const host=document.querySelector('#management-rows');
  host.replaceChildren();
  if(!appointments.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.className='management-empty';cell.colSpan=5;cell.textContent='No appointments match these filters.';row.append(cell);host.append(row);return}
  for(const appointment of appointments){
    const row=document.createElement('tr');
    const patient=document.createElement('td'),patientName=document.createElement('strong');patientName.textContent=appointment.patientName;patient.append(patientName);
    const doctor=document.createElement('td');doctor.textContent=`${appointment.doctorName} · ${appointment.specialty}`;
    const date=document.createElement('td');date.textContent=`${formatDate(appointment.date)} · ${appointment.time}`;
    const statusCell=document.createElement('td'),status=document.createElement('span');status.className=`status-pill status-${appointment.status}`;status.textContent=appointment.status==='booked'?'Pending':appointment.status;statusCell.append(status);
    const actionCell=document.createElement('td'),actions=document.createElement('div');actions.className='management-actions';
    const addAction=(label,nextStatus)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.managementStatus=nextStatus;button.dataset.reference=appointment.confirmationCode;actions.append(button)};
    if(appointment.status==='booked'){addAction('Mark done','completed');addAction('Cancel','cancelled')}
    else if(appointment.status==='cancelled')addAction('Restore','booked');
    else actions.textContent='—';
    actionCell.append(actions);row.append(patient,doctor,date,statusCell,actionCell);host.append(row);
  }
}

async function loadManagement(){
  clearFormError('#management-error');
  const query=new URLSearchParams();
  const status=document.querySelector('#management-status').value;
  const date=document.querySelector('#management-date').value;
  if(status)query.set('status',status);
  if(date)query.set('date',date);
  try{
    const data=await apiRequest(`/api/management/appointments?${query}`);
    for(const key of ['total','booked','upcoming','completed','cancelled'])document.querySelector(`#stat-${key}`).textContent=data.summary[key];
    renderManagementRows(data.appointments);
  }catch(error){renderManagementRows([]);showFormError('#management-error',error.message)}
}

document.querySelectorAll('[data-open-booking]').forEach(button=>button.addEventListener('click',()=>openBooking()));
document.querySelectorAll('[data-close-modal]').forEach(button=>button.addEventListener('click',()=>closeDialog(button.closest('dialog'))));
document.querySelector('[data-open-appointments]').addEventListener('click',()=>{document.querySelector('#appointments-list').innerHTML='';clearFormError('#lookup-error');document.querySelector('#lookup-form').reset();appointmentsModal.showModal();document.body.classList.add('modal-open')});
document.querySelector('[data-open-management]').addEventListener('click',()=>{document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());managementModal.showModal();document.body.classList.add('modal-open');loadManagement()});
document.querySelector('#management-status').addEventListener('change',loadManagement);
document.querySelector('#management-date').addEventListener('change',loadManagement);
document.querySelector('#management-reset').addEventListener('click',()=>{document.querySelector('#management-status').value='all';document.querySelector('#management-date').value='';loadManagement()});
document.querySelector('#management-rows').addEventListener('click',async event=>{
  const button=event.target.closest('[data-management-status]');
  if(!button)return;
  button.disabled=true;clearFormError('#management-error');
  try{await apiRequest(`/api/management/appointments/${encodeURIComponent(button.dataset.reference)}`,{method:'PATCH',body:JSON.stringify({status:button.dataset.managementStatus})});await loadManagement()}
  catch(error){showFormError('#management-error',error.message);button.disabled=false}
});
specialtySelect.addEventListener('change',()=>{refreshDoctorOptions();refreshAvailability()});
doctorSelect.addEventListener('change',refreshAvailability);
dateInput.addEventListener('change',refreshAvailability);
document.addEventListener('click',event=>{
  const bookButton=event.target.closest('[data-book-doctor]');
  if(bookButton){const doctor=doctors.find(item=>item.id===bookButton.dataset.bookDoctor);if(doctor)openBooking({specialty:doctor.specialty,doctorId:doctor.id});}
  const specialtyButton=event.target.closest('[data-specialty]');
  if(specialtyButton)openBooking({specialty:specialtyButton.dataset.specialty});
  if(event.target===bookingModal||event.target===resultModal||event.target===appointmentsModal||event.target===managementModal)closeDialog(event.target);
});

document.querySelector('#quick-search-button').addEventListener('click',()=>{
  const specialty=document.querySelector('#quick-specialty').value;
  const date=document.querySelector('#quick-date').value;
  openBooking({specialty,date});
});

form.addEventListener('submit',async event=>{
  event.preventDefault();
  clearFormError('#booking-error');
  const submit=form.querySelector('[type="submit"]');
  submit.disabled=true;
  try{
    const data=Object.fromEntries(new FormData(form).entries());
    const appointment=await apiRequest('/api/appointments',{method:'POST',body:JSON.stringify(data)});
    form.reset();dateInput.value=localToday;refreshDoctorOptions();refreshAvailability();closeDialog(bookingModal);fillReceipt(appointment);resultModal.showModal();document.body.classList.add('modal-open');
  }catch(error){showFormError('#booking-error',error.message)}
  finally{submit.disabled=false}
});

document.querySelector('#lookup-form').addEventListener('submit',async event=>{
  event.preventDefault();
  clearFormError('#lookup-error');
  const data=Object.fromEntries(new FormData(event.currentTarget).entries());
  const button=event.currentTarget.querySelector('[type="submit"]');
  button.disabled=true;
  try{
    const query=new URLSearchParams({email:data.email,reference:data.reference});
    const appointment=await apiRequest(`/api/appointments?${query}`);
    showAppointment(appointment);
  }catch(error){document.querySelector('#appointments-list').innerHTML='';showFormError('#lookup-error',error.message)}
  finally{button.disabled=false}
});

document.querySelector('#architecture-toggle').addEventListener('click',event=>{
  const button=event.currentTarget,detail=document.querySelector('#architecture-detail');
  const isOpen=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!isOpen));detail.hidden=isOpen;button.querySelector('span').textContent=isOpen?'＋':'−';
});

const menuToggle=document.querySelector('.menu-toggle');
menuToggle.addEventListener('click',()=>{const nav=document.querySelector('.main-nav'),open=nav.classList.toggle('open');menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'Close navigation':'Open navigation')});
document.querySelectorAll('.main-nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelector('.main-nav').classList.remove('open');menuToggle.setAttribute('aria-expanded','false')}));
document.querySelector('#show-all-doctors').addEventListener('click',async event=>{
  event.preventDefault();
  try{doctors=await apiRequest('/api/doctors');renderDoctors()}
  catch(error){doctorGrid.innerHTML=`<p class="empty-doctors">${error.message}</p>`}
});

const today=new Date();
const localToday=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
for(const input of [dateInput,document.querySelector('#quick-date')])input.min=localToday;
dateInput.value=localToday;

refreshDoctorOptions();
renderDoctors();
apiRequest('/api/doctors').then(items=>{if(items.length)doctors=items;renderDoctors();refreshDoctorOptions()}).catch(()=>{});
