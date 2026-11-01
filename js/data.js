/* AZoom — data.js
   Fleet, locations, prices and other fixed data. Edit this file to change cars or rates. */

/* =========================================================
   1. CONSTANTS & SEED DATA
   ========================================================= */
const GST = 0.09;              // Singapore GST rate
const DEPOSIT = 500;
const LOW_BATT_FEE = 50;
const KEY = { users:'az5_users', fleet:'az5_fleet', bookings:'az5_bookings', session:'az5_session' };

const BRANCHES = {
  rp:{ id:'rp', name:'Raffles Place (City)', address:'1 Raffles Place, #B1-12, Singapore 048616', lat:1.2840, lng:103.8510 },
  ch:{ id:'ch', name:'Changi Airport', address:'80 Airport Boulevard, Singapore 819642', lat:1.3644, lng:103.9915 }
};
const CARPARKS = [
  { id:'cp1', name:'Raffles Place B1 car park', address:'1 Raffles Place, Basement 1, Lots 40–52', lat:1.2843, lng:103.8514 },
  { id:'cp2', name:'Changi Airport T3 car park', address:'65 Airport Blvd, Level 2, Zone B', lat:1.3570, lng:103.9865 },
  { id:'cp3', name:'Marina Bay Sands car park', address:'10 Bayfront Ave, B2, Lots 120–128', lat:1.2834, lng:103.8607 },
  { id:'cp4', name:'NEX Serangoon car park', address:'23 Serangoon Central, B3, Lots 300–306', lat:1.3509, lng:103.8721 }
];
const CHARGERS = [
  { name:'Shell Recharge Orchard', address:'391 Orchard Rd', lat:1.3040, lng:103.8320 },
  { name:'SP Mobility Marina Bay', address:'10 Bayfront Ave', lat:1.2830, lng:103.8600 },
  { name:'Charge+ Suntec City', address:'3 Temasek Blvd', lat:1.2950, lng:103.8590 },
  { name:'Tesla Supercharger Toa Payoh', address:'480 Lor 6 Toa Payoh', lat:1.3340, lng:103.8480 }
];

const DEFAULT_FLEET = [
  { id:1, make:'Tesla', model:'Model 3', type:'sedan', shape:'sedan', seats:5, price:120, range:513, charge:25, boot:594, color:'#E8E8E4', plate:'SNB 4821 K', status:'available', battery:100, notes:'' },
  { id:2, make:'Tesla', model:'Model Y', type:'suv', shape:'suv', seats:5, price:140, range:455, charge:27, boot:854, color:'#23395B', plate:'SNC 1093 D', status:'available', battery:96, notes:'' },
  { id:3, make:'BYD', model:'Atto 3', type:'crossover', shape:'suv', seats:5, price:95, range:420, charge:29, boot:440, color:'#2E8C8A', plate:'SNE 6612 G', status:'available', battery:100, notes:'' },
  { id:4, make:'Hyundai', model:'Ioniq 5', type:'crossover', shape:'hatch', seats:5, price:130, range:454, charge:18, boot:527, color:'#8C9A8E', plate:'SNF 2207 B', status:'charging', battery:58, notes:'Ready by 6pm' },
  { id:5, make:'BYD', model:'M6', type:'mpv', shape:'mpv', seats:7, price:150, range:420, charge:35, boot:580, color:'#BFC4C6', plate:'SNG 7740 M', status:'available', battery:100, notes:'' },
  { id:6, make:'BMW', model:'i4 eDrive35', type:'sedan', shape:'sedan', seats:5, price:190, range:483, charge:31, boot:470, color:'#2B5FA8', plate:'SNH 3158 T', status:'available', battery:90, notes:'' },
  { id:7, make:'Mercedes', model:'EQB 250+', type:'suv', shape:'mpv', seats:7, price:175, range:423, charge:32, boot:495, color:'#3A3A3C', plate:'SNJ 9014 A', status:'available', battery:100, notes:'' },
  { id:8, make:'Porsche', model:'Taycan', type:'sedan', shape:'sedan', seats:4, price:320, range:431, charge:22, boot:407, color:'#B3202E', plate:'SNK 0911 P', status:'available', battery:100, notes:'' },
  { id:9, make:'MG', model:'4 EV', type:'hatchback', shape:'hatch', seats:5, price:85, range:350, charge:35, boot:363, color:'#E9B949', plate:'SNL 5530 E', status:'available', battery:100, notes:'' },
  { id:10, make:'Polestar', model:'2', type:'sedan', shape:'hatch', seats:5, price:160, range:478, charge:28, boot:405, color:'#6B7C85', plate:'SNM 8822 R', status:'maintenance', battery:12, notes:'Brake service due' }
];

const PROTECTION = [
  { id:'basic', name:'Basic cover', rate:0, excess:3000, desc:'Included. You pay up to S$3,000 for damage.' },
  { id:'standard', name:'Standard cover', rate:18, excess:1000, desc:'You pay up to S$1,000 for damage.', tag:'Popular' },
  { id:'full', name:'Full cover', rate:32, excess:0, desc:'Zero excess. No damage charges at inspection.' }
];
const EXTRAS = [
  { id:'driver2', name:'Additional driver', rate:12, desc:'Add a second licensed driver.' },
  { id:'child', name:'Child seat', rate:8, cap:64, desc:'For children 9–18 kg. Max S$64 per rental.' },
  { id:'cable', name:'Portable Type 2 cable', rate:6, desc:'Charge at any public AC point.' },
  { id:'prepaid', name:'Pre-paid charging', flat:30, desc:'Return at any battery level, no recharging fee.' }
];
const DAMAGE_ITEMS = [
  { id:'scratch', label:'Minor scratch / scuff', fee:150 },
  { id:'dent', label:'Dent (panel repair)', fee:380 },
  { id:'rim', label:'Wheel / rim damage', fee:220 },
  { id:'glass', label:'Windscreen chip', fee:180 },
  { id:'clean', label:'Interior cleaning required', fee:80 },
  { id:'smoke', label:'Smoking odour treatment', fee:200 }
];
const STATUS_INFO = {
  reserved:{ label:'Reserved', cls:'info' }, active:{ label:'On rent', cls:'ok' },
  returned:{ label:'Awaiting inspection', cls:'warn' }, inspected:{ label:'Final bill due', cls:'bad' },
  closed:{ label:'Completed', cls:'neutral' }, cancelled:{ label:'Cancelled', cls:'neutral' }
};

