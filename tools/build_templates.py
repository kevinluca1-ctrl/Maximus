"""Erzeugt fitness/app/data/templates.json (Trainingsmodelle) und prüft das Wochenvolumen je Muskelgruppe.
Aufruf: python3 tools/build_templates.py      (nur prüfen)
        python3 tools/build_templates.py -w   (schreiben)"""
import json, sys
from pathlib import Path
B=str(Path(__file__).resolve().parent.parent / 'fitness/app/data') + '/'
EX={e['id']:e for e in json.load(open(B+'exercises.json'))['exercises']}
GROUPS={'chest':['chest','chest_upper'],'shoulders':['front_delt','side_delt','rear_delt'],'triceps':['triceps'],'back':['lats','rhomboids','traps','lower_back'],'biceps':['biceps'],'forearms':['forearms'],'quads':['quads'],'hamstrings':['hamstrings'],'hips':['glutes','glute_med','adductors'],'calves':['calves'],'core':['abs','obliques']}
VOL={'chest':[8,18],'shoulders':[8,22],'triceps':[6,14],'back':[10,20],'biceps':[6,14],'forearms':[0,8],'quads':[8,18],'hamstrings':[6,14],'hips':[6,16],'calves':[6,12],'core':[4,12]}
def it(e,s,r,rest=75): assert e in EX,e; return {'exercise':e,'sets':s,'reps':r,'rest':rest}
def R(id,name,wd,items): return {'id':id,'name':name,'weekday':wd,'start':'18:15','end':'19:40','items':items}
import copy
default=copy.deepcopy(json.load(open(B+'default_routines.json'))['routines'])
for r in default:
    r['id']='ppl_'+r['id']
    for i in r['items']:
        if i['exercise'] in ('pallof_press','cable_woodchop'): i['sets']=2
        if i['exercise'] in ('calf_raise','seated_leg_curl'): i['sets']=4
    if r['id']=='ppl_B': r['items'].append(it('seated_calf',2,'12-15',60))
T=[
 {'id':'ppl','name':'Push / Beine / Pull','days':3,'level':'Fortgeschrittene Einsteiger',
  'about':'Jede Einheit hat einen klaren Schwerpunkt, jeder Muskel wird einmal pro Woche mit hohem Volumen trainiert. Basis ist dein Plan Gym A, B, C, ergänzt um etwas mehr Bein- und Wadenvolumen und weniger Bauch.',
  'tips':['Passt gut zu festen drei Terminen pro Woche.','Fällt eine Einheit aus, fehlt eine Muskelgruppe die ganze Woche. Dann besser die Reihenfolge verschieben als auslassen.'],
  'routines':default},
 {'id':'upper_lower','name':'Ober-/Unterkörper','days':4,'level':'Fortgeschrittene',
  'about':'Vier Einheiten im Wechsel Oberkörper und Unterkörper. Jeder Muskel wird zweimal pro Woche trainiert, die einzelnen Einheiten bleiben kürzer.',
  'tips':['Zwischen den beiden Beintagen mindestens 48 Stunden Pause.','Variante A und B nutzen unterschiedliche Übungen für mehr Abwechslung.'],
  'routines':[
   R('ul1','Oberkörper A','MO',[it('chest_press',3,'6-10',90),it('seated_cable_row',3,'8-12'),it('shoulder_press',3,'8-12'),it('lat_pulldown_wide',3,'8-12'),it('cable_lateral_raise',3,'12-15',60),it('triceps_pushdown',2,'10-15',60),it('cable_curl',2,'10-12',60)]),
   R('ul2','Unterkörper A','TU',[it('leg_press',4,'6-10',120),it('seated_leg_curl',3,'10-12'),it('hip_thrust_machine',3,'8-12',90),it('leg_extension',2,'10-15',60),it('calf_raise',3,'12-15',60),it('cable_crunch',3,'10-15',60)]),
   R('ul3','Oberkörper B','TH',[it('incline_press',3,'8-12',90),it('chest_supported_row',3,'8-12'),it('single_arm_pulldown',3,'10-12 pro Seite'),it('cable_crossover',3,'10-15',60),it('face_pull',3,'15',60),it('cable_lateral_raise',2,'12-15',60),it('overhead_triceps',2,'10-12',60),it('hammer_curl',2,'10-12',60)]),
   R('ul4','Unterkörper B','FR',[it('hack_squat',3,'8-12',120),it('lying_leg_curl',3,'10-12'),it('cable_pull_through',3,'10-12'),it('hip_abduction',2,'12-15',60),it('seated_calf',3,'12-15',60),it('pallof_press',3,'10 pro Seite',60)]),
  ]},
 {'id':'full2','name':'2x Ganzkörper','days':2,'level':'Einsteiger oder wenig Zeit',
  'about':'Zwei längere Einheiten, jede trainiert den ganzen Körper. Mit zwei Terminen pro Woche erreicht so trotzdem jeder Muskel das Mindestvolumen.',
  'tips':['Zwischen den Einheiten zwei bis drei Tage Pause, etwa Montag und Donnerstag.','Pausen eher kurz halten, damit die Einheit in 85 Minuten passt.'],
  'routines':[
   R('fb2a','Ganzkörper A','MO',[it('leg_press',3,'6-10',120),it('chest_press',3,'6-10',90),it('lat_pulldown_wide',3,'8-12'),it('seated_leg_curl',3,'10-12'),it('shoulder_press',2,'8-12'),it('seated_cable_row',3,'8-12'),it('cable_lateral_raise',3,'12-15',60),it('triceps_pushdown',2,'10-15',60),it('cable_curl',2,'10-12',60),it('leg_extension',2,'10-15',60),it('calf_raise',4,'12-15',60),it('pallof_press',2,'10 pro Seite',60)]),
   R('fb2b','Ganzkörper B','TH',[it('hack_squat',3,'8-12',120),it('incline_press',3,'8-12',90),it('chest_supported_row',3,'8-12'),it('hip_thrust_machine',3,'8-12',90),it('single_arm_pulldown',2,'10-12 pro Seite'),it('lying_leg_curl',2,'10-12'),it('cable_crossover',2,'10-15',60),it('face_pull',2,'15',60),it('overhead_triceps',2,'10-12',60),it('hammer_curl',2,'10-12',60),it('cable_crunch',3,'10-15',60)]),
  ]},
 {'id':'full3','name':'3x Ganzkörper','days':3,'level':'Einsteiger und Fortgeschrittene',
  'about':'Drei kürzere Ganzkörper-Einheiten. Jeder Muskel wird dreimal pro Woche mit wenigen Sätzen trainiert, das verteilt die Belastung gut.',
  'tips':['Jede Einheit ist ähnlich anstrengend, ein ausgefallener Termin wiegt weniger schwer.','Die schweren Übungen am Anfang wechseln je Einheit, damit Gelenke und Muskeln Abwechslung bekommen.'],
  'routines':[
   R('fb3a','Ganzkörper A','MO',[it('leg_press',3,'6-10',120),it('chest_press',3,'6-10',90),it('lat_pulldown_wide',3,'8-12'),it('seated_leg_curl',3,'10-12'),it('cable_lateral_raise',3,'12-15',60),it('triceps_pushdown',2,'10-15',60),it('cable_crunch',3,'10-15',60)]),
   R('fb3b','Ganzkörper B','WE',[it('hack_squat',3,'8-12',120),it('incline_press',3,'8-12',90),it('seated_cable_row',3,'8-12'),it('hip_thrust_machine',3,'8-12',90),it('shoulder_press',2,'8-12'),it('cable_curl',2,'10-12',60),it('calf_raise',3,'12-15',60)]),
   R('fb3c','Ganzkörper C','FR',[it('lying_leg_curl',3,'10-12'),it('cable_crossover',3,'10-15',60),it('single_arm_pulldown',3,'10-12 pro Seite'),it('leg_extension',3,'10-15',60),it('face_pull',3,'15',60),it('overhead_triceps',2,'10-12',60),it('hammer_curl',2,'10-12',60),it('pallof_press',2,'10 pro Seite',60)]),
  ]},
]
def vol(rs):
    v={g:0 for g in GROUPS}
    for r in rs:
        for i in r['items']:
            m=EX[i['exercise']]['muscles']
            for g,ms in GROUPS.items():
                f=1 if any(x in ms for x in m['primary']) else .5 if any(x in ms for x in m['secondary']) else 0
                v[g]+=f*i['sets']
    return v
for t in T:
    v=vol(t['routines'])
    print(t['id'], [sum(i['sets'] for i in r['items']) for r in t['routines']])
    print('   '+'  '.join(f"{g}:{v[g]:g}{'' if VOL[g][0]<=v[g]<=VOL[g][1] else '!'}" for g in GROUPS))
if '-w' in sys.argv:
    out={'volume':{'note':'Arbeitssätze pro Woche je Muskelgruppe. Hauptmuskel zählt ganz, Hilfsmuskel halb. Richtwerte für Muskelaufbau: Einsteiger am unteren Ende, mehr bringt nur mit guter Erholung etwas.','ranges':VOL},'templates':T}
    json.dump(out,open(B+'templates.json','w'),ensure_ascii=False,indent=1); print('geschrieben')
