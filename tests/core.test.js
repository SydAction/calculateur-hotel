// Teste les calculs et le verdict extraits de index.html (bloc CORE). Lancer : node tests/core.test.js
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const core=html.split('/* ==== CORE START')[1].split('/* ==== CORE END ==== */')[0].replace(/^[^\n]*\n/,'');
const api=new Function(core+';return{compute,verdict,mensualite,nums,questionsFor}')();
let fail=0;
function eq(label,got,exp,tol){
  const ok=typeof exp==='number'?Math.abs(got-exp)<=(tol||0.005):got===exp;
  console.log((ok?'OK  ':'FAIL')+' '+label+' = '+got+(ok?'':'  (attendu '+exp+')'));
  if(!ok)fail++;
}
const allYes=t=>{const a={};api.questionsFor(t).forEach(q=>a['q'+q.id]='oui');return a};

// ---- HOTEL exemple : 1 200 000 $, 12 ch., 120 $/nuit, 40 %, autres 30 000, charges 55 %, réserve 4 %,
// travaux 50 000, frais 4 %, apport 400 000, 8 % sur 20 ans
const H={name:'Test',prix:'1200000',chambres:'12',adr:'120',occ:'40',autres:'30000',chMode:'pct',chPct:'55',chUsd:'',reserve:'4',travaux:'50000',frais:'4',apport:'400000',taux:'8',duree:'20'};
let r=api.compute('hotel',H);
// à la main : 12*365*120*0.4 = 210 240 ; +30 000 = 240 240
eq('hotel CA',r.rev,240240);
eq('hotel RevPAR',r.revpar,48);
// charges 55 % = 132 132 ; réserve 4 % = 9 609,6 ; NOI = 98 498,4
eq('hotel NOI',r.noi,98498.4);
eq('hotel cap rate %',r.cap*100,8.2082,0.001);
eq('hotel prix max 10 %',r.max10,984984);
eq('hotel prix max 12 %',r.max12,820820);
// coût = 1 200 000 + 48 000 + 50 000 = 1 298 000 ; prêt = 898 000
eq('hotel prêt',r.loan,898000);
// mensualité 898 000 à 8 %/20 ans = 7 511,38
eq('hotel mensualité',r.pay,7511.23,0.05);
eq('hotel cash-flow',r.cf,98498.4-7511.23*12,1);
eq('hotel retour sur apport %',r.roe*100,(98498.4-90134.76)/400000*100,0.01);
let v=api.verdict('hotel',r,H,allYes('hotel'));
eq('hotel verdict (cap 8,2 % => orange)',v.level,'orange');

// ---- VILLA exemple : 400 000 $, 3 ch., 200 $/nuit, 40 %, gestion 20 %, ménage 80 $, séjour 4 nuits,
// charges 6 postes = 12 000, taxe 0,25 %, frais 4 %, apport 120 000, 7 % sur 25 ans
const V={name:'Villa',prix:'400000',chambres:'3',adr:'200',occ:'40',gestion:'20',menage:'80',duree:'4',elec:'3000',eau:'600',net:'600',entretien:'3000',piscine:'3000',assurance:'1800',taxe:'0.25',frais:'4',apport:'120000',taux:'7',duree_pret:'25'};
r=api.compute('villa',V);
eq('villa brut',r.gross,29200);            // 365*0,4*200
eq('villa séjours',r.stays,36.5);           // 146 nuits / 4
eq('villa gestion',r.mgmt,5840);
eq('villa ménage',r.clean,2920);
eq('villa charges',r.charges,12000);
eq('villa taxe foncière',r.tax,1000);
eq('villa net',r.net,29200-5840-2920-12000-1000); // 7 440
eq('villa rendement brut %',r.grossYield*100,7.3);
eq('villa rendement net % (sur 416 000)',r.netYield*100,7440/416000*100,0.001);
// prix max 7 % : A=29200-5840-2920-12000=8440 ; P=8440/(0,07*1,04+0,0025)=8440/0,0753
eq('villa prix max 7 %',r.maxP,8440/0.0753,0.5);
// contre-épreuve : au prix max, le rendement net vaut exactement 7 %
const V2=Object.assign({},V,{prix:String(r.maxP)});
eq('villa contre-épreuve 7 % au prix max',api.compute('villa',V2).netYield*100,7,0.0001);
// prêt = 416 000 - 120 000 = 296 000
eq('villa prêt',r.loan,296000);
v=api.verdict('villa',r,V,allYes('villa'));
eq('villa verdict (net 1,79 % => rouge)',v.level,'red');

// ---- Bornes exactes du feu tricolore (hotel, tout Oui) : on fabrique un NOI qui donne le cap voulu
function hotelAtCap(capPct,occ){
  // prix 1 000 000 ; autres revenus ajustés pour NOI = cap*prix ; charges 0 % et réserve 0 % => NOI = CA
  return Object.assign({},H,{prix:'1000000',chambres:'10',adr:'100',occ:String(occ||40),autres:'0',chPct:'0',reserve:'0',travaux:'0',apport:'1000000',taux:'',duree:''},{autres:String(capPct*10000-10*365*100*(occ||40)/100)});
}
[[7.99,'red'],[8,'orange'],[9.99,'orange'],[10,'green'],[12,'green'],[12.01,'orange']].forEach(([cap,exp])=>{
  const d=hotelAtCap(cap);const rr=api.compute('hotel',d);
  eq('hotel cap '+cap+' % => '+exp,api.verdict('hotel',rr,d,allYes('hotel')).level,exp);
});
// villa : brut ajusté pour viser un net voulu (gestion 0, ménage 0, charges 0, taxe 0, frais 0)
function villaAtNet(p){return Object.assign({},V,{prix:'1000000',gestion:'0',menage:'0',elec:'0',eau:'0',net:'0',entretien:'0',piscine:'0',assurance:'0',taxe:'0',frais:'0',occ:'40',adr:String(p*10000/(365*0.4)),apport:'1000000',taux:'',duree_pret:''})}
[[4.99,'red'],[5,'orange'],[6.99,'orange'],[7,'green'],[15,'green']].forEach(([p,exp])=>{
  const d=villaAtNet(p);eq('villa net '+p+' % => '+exp,api.verdict('villa',api.compute('villa',d),d,allYes('villa')).level,exp);
});
// occupation : 55 % ok (vert), 55,1 % orange
let d=hotelAtCap(11,55);eq('occupation 55 % => vert',api.verdict('hotel',api.compute('hotel',d),d,allYes('hotel')).level,'green');
d=hotelAtCap(11,55.1);eq('occupation 55,1 % => orange',api.verdict('hotel',api.compute('hotel',d),d,allYes('hotel')).level,'orange');

// ---- Questions : rouge sur Q1/Q3/Q5/Q8, orange sur les autres, Q10/Q11 hôtel seulement
d=hotelAtCap(11);
[1,3,5,8].forEach(i=>{['non','jsp'].forEach(x=>{const a=allYes('hotel');a['q'+i]=x;eq('Q'+i+' '+x+' => rouge',api.verdict('hotel',api.compute('hotel',d),d,a).level,'red')})});
[2,4,6,7,9,10,11].forEach(i=>{const a=allYes('hotel');a['q'+i]='jsp';eq('Q'+i+' jsp => orange',api.verdict('hotel',api.compute('hotel',d),d,a).level,'orange')});
eq('villa : 9 questions',api.questionsFor('villa').length,9);
eq('hotel : 11 questions',api.questionsFor('hotel').length,11);
// ---- Cas limites
const cash=Object.assign({},H,{apport:'99999999',taux:'',duree:''});
eq('apport > coût => prêt 0',api.compute('hotel',cash).loan,0);
eq('mensualité 0 % sur 10 ans',api.mensualite(120000,0,10),1000);
const neg=Object.assign({},H,{chPct:'97',reserve:'4'});
eq('hotel NOI négatif => pas de prix max',api.compute('hotel',neg).max10,null);
eq('hotel cash-flow<=0 => pas de payback',api.compute('hotel',Object.assign({},H,{chPct:'80'})).payback,null);
console.log(fail?('\n'+fail+' ÉCHEC(S)'):'\nTOUS LES TESTS PASSENT');
process.exit(fail?1:0);
