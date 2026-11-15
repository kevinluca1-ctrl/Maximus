import json, os
os.chdir('/home/claude/fitness-addon/fitness/app')
d=json.load(open('data/exercises.json')); E=d['exercises']
if d.get('version')==2: raise SystemExit('bereits erweitert')
byname={e['name_de']:e['id'] for e in E}
NEW=[
('cable_chest_press','Brustpresse am Kabel, stehend','Standing Cable Chest Press','Kabelzug',['chest'],['front_delt','triceps'],['Rollen auf Brusthöhe, Schrittstellung zwischen den Türmen.','Griffe neben der Brust, Ellbogen leicht unter Schulterhöhe.','Nach vorne drücken, Hände vor der Brust zusammenführen und langsam zurück.']),
('smith_bench','Bankdrücken an der Smith Machine','Smith Machine Bench Press','Smith Machine',['chest'],['front_delt','triceps'],['Flachbank so stellen, dass die Stange über der unteren Brust läuft.','Stange etwas breiter als schulterbreit fassen, Schulterblätter zusammen.','Kontrolliert zur Brust senken und nach oben drücken.']),
('low_high_fly','Kabel-Fly von unten nach oben','Low-to-High Cable Fly','Kabelzug',['chest_upper'],['front_delt','chest'],['Rollen ganz unten, mittig zwischen den Türmen stehen.','Arme leicht gebeugt, Handflächen nach vorne oben.','Hände im Bogen auf Kinnhöhe zusammenführen, langsam zurück.']),
('smith_incline','Schrägbankdrücken an der Smith Machine','Smith Machine Incline Press','Smith Machine',['chest_upper'],['front_delt','triceps'],['Bank auf 30 Grad, Stange über der oberen Brust.','Schulterblätter fixieren, Füße fest am Boden.','Zur oberen Brust senken und drücken.']),
('pec_deck','Butterfly-Maschine','Pec Deck','Maschine',['chest'],['front_delt'],['Sitz so einstellen, dass die Griffe auf Brusthöhe sind.','Arme leicht gebeugt, Rücken an die Lehne.','Arme vor der Brust zusammenführen, langsam öffnen.']),
('high_low_fly','Kabel-Fly von oben nach unten','High-to-Low Cable Fly','Kabelzug',['chest'],['front_delt'],['Rollen ganz oben, Schrittstellung, Oberkörper leicht vor.','Arme leicht gebeugt.','Hände im Bogen vor die Hüfte führen, langsam zurück.']),
('cable_shoulder_press','Schulterdrücken am Kabel','Cable Shoulder Press','Kabelzug',['front_delt'],['side_delt','triceps'],['Bank zwischen die Türme, Rollen unten.','Griffe auf Schulterhöhe.','Senkrecht nach oben drücken, kontrolliert zurück.']),
('smith_shoulder_press','Schulterdrücken an der Smith Machine','Smith Machine Shoulder Press','Smith Machine',['front_delt'],['side_delt','triceps'],['Bank aufrecht, Stange vor dem Gesicht.','Stange etwas breiter als schulterbreit fassen.','Bis Kinnhöhe senken und nach oben drücken.']),
('machine_lateral','Seitheben-Maschine','Machine Lateral Raise','Maschine',['side_delt'],['traps'],['Sitz so einstellen, dass die Schultern auf Höhe des Drehpunkts sind.','Arme an die Polster.','Bis Schulterhöhe heben, langsam senken.']),
('db_lateral','Seitheben mit Kurzhanteln','Dumbbell Lateral Raise','Kurzhanteln',['side_delt'],['traps','front_delt'],['Aufrecht stehen, Hanteln seitlich.','Arme leicht gebeugt.','Seitlich bis Schulterhöhe heben, langsam senken.']),
('bar_pushdown','Trizepsdrücken mit Stange','Straight-Bar Pushdown','Kabelzug',['triceps'],['forearms'],['Rolle oben, Stange im Obergriff.','Ellbogen am Körper.','Nach unten strecken, langsam zurück bis 90 Grad.']),
('dip_machine','Dip-Maschine','Machine Dip','Maschine',['triceps'],['chest','front_delt'],['Sitz so einstellen, dass die Griffe neben der Hüfte sind.','Oberkörper aufrecht.','Griffe nach unten drücken, langsam zurück.']),
('single_arm_triceps','Trizepsstrecken einarmig am Kabel','Single-Arm Cable Triceps Extension','Kabelzug',['triceps'],[],['Rolle oben, einzelner Griff im Untergriff.','Ellbogen am Körper.','Arm nach unten strecken, langsam zurück.']),
('ab_machine','Bauchmaschine (Crunch)','Ab Crunch Machine','Maschine',['abs'],['obliques'],['Sitz einstellen, Füße fixieren, Griffe fassen.','Oberkörper einrollen, Bauch anspannen.','Langsam zurück.']),
('floor_crunch','Crunch am Boden','Crunch','Körpergewicht',['abs'],[],['Rückenlage, Knie gebeugt.','Schultern vom Boden einrollen.','Langsam ablegen.']),
('side_plank','Seitstütz','Side Plank','Körpergewicht',['obliques'],['abs','glute_med'],['Seitlage, Unterarm unter der Schulter.','Hüfte heben, Körper gerade.','Halten, dann Seite wechseln.']),
('hack_squat','Hackenschmidt-Maschine','Hack Squat','Maschine',['quads'],['glutes','adductors'],['Rücken an die Lehne, Füße schulterbreit.','Bis ca. 90 Grad beugen.','Über die ganze Fußsohle nach oben drücken.']),
('smith_squat','Kniebeuge an der Smith Machine','Smith Machine Squat','Smith Machine',['quads'],['glutes','hamstrings'],['Stange auf dem oberen Rücken, Füße leicht vor dem Körper.','Kontrolliert in die Hocke.','Nach oben drücken.']),
('lying_leg_curl','Beinbeuger liegend','Lying Leg Curl','Maschine',['hamstrings'],['calves'],['Bauchlage, Polster über der Ferse.','Fersen zum Gesäß ziehen.','Langsam zurück.']),
('narrow_leg_press','Beinpresse mit engem Stand','Narrow-Stance Leg Press','Maschine',['quads'],['glutes'],['Füße hüftbreit, tief auf der Platte.','Knie weit beugen.','Nach oben drücken.']),
('smith_lunge','Ausfallschritte an der Smith Machine','Smith Machine Split Squat','Smith Machine',['quads'],['glutes','adductors'],['Stange auf dem Rücken, großer Schritt nach vorne.','Hinteres Knie Richtung Boden senken.','Über das vordere Bein hochdrücken.']),
('glute_kickback_machine','Glute-Maschine (Kickback)','Glute Kickback Machine','Maschine',['glutes'],['hamstrings'],['Brust an das Polster, Fuß auf die Platte.','Bein nach hinten oben strecken.','Langsam zurück, Seite wechseln.']),
('hip_thrust_machine','Hip Thrust an der Maschine','Machine Hip Thrust','Maschine',['glutes'],['hamstrings'],['Rücken an das Polster, Gurt über der Hüfte.','Hüfte nach oben strecken.','Oben anspannen, langsam senken.']),
('cable_abduction','Abduktion am Kabel stehend','Standing Cable Hip Abduction','Kabelzug',['glute_med'],['glutes'],['Rolle unten, Manschette am äußeren Knöchel.','Aufrecht stehen, am Turm festhalten.','Bein seitlich abspreizen, langsam zurück.']),
('side_leg_raise','Seitliches Beinheben','Side-Lying Leg Raise','Körpergewicht',['glute_med'],[],['Seitlage, Beine gestreckt.','Oberes Bein anheben.','Langsam senken.']),
('seated_calf','Wadenheben sitzend','Seated Calf Raise','Maschine',['calves'],[],['Polster auf den Oberschenkeln, Fußballen auf der Kante.','Fersen tief absenken.','Hoch auf die Zehen drücken.']),
('smith_calf','Wadenheben an der Smith Machine','Smith Machine Calf Raise','Smith Machine',['calves'],[],['Stange auf dem Rücken, Fußballen auf einer Erhöhung.','Fersen absenken.','Hoch auf die Zehen drücken.']),
('lat_machine','Latzug-Maschine','Machine Lat Pulldown','Maschine',['lats'],['biceps','rhomboids'],['Knie unter die Polster, Griffe fassen.','Brust raus.','Griffe nach unten ziehen, langsam zurück.']),
('assisted_pullup','Klimmzug-Maschine mit Unterstützung','Assisted Pull-Up','Maschine',['lats'],['biceps','rhomboids','rear_delt'],['Knie auf das Polster, Griffe breit fassen.','Brust zur Stange ziehen.','Langsam nach unten, Arme fast strecken.']),
('chest_supported_row','Rudermaschine mit Brustpolster','Chest-Supported Machine Row','Maschine',['rhomboids','lats'],['biceps','rear_delt'],['Brust an das Polster, Griffe fassen.','Ellbogen nach hinten ziehen, Schulterblätter zusammen.','Langsam zurück.']),
('single_arm_cable_row','Rudern einarmig am Kabel','Single-Arm Cable Row','Kabelzug',['lats'],['rhomboids','biceps'],['Rolle auf Brusthöhe, einzelner Griff.','Ellbogen eng zur Hüfte ziehen.','Langsam zurück, Seite wechseln.']),
('close_grip_pulldown','Latzug eng im Neutralgriff','Close-Grip Pulldown','Kabelzug',['lats'],['biceps','rhomboids'],['V-Griff einhängen, Knierolle einstellen.','Griff zur Brust ziehen.','Langsam nach oben.']),
('pullover_machine','Überzug-Maschine','Machine Pullover','Maschine',['lats'],['triceps'],['Sitz einstellen, Ellbogen an die Polster.','Arme im Bogen nach unten bewegen.','Langsam zurück.']),
('reverse_pec_deck','Reverse Butterfly (Maschine)','Reverse Pec Deck','Maschine',['rear_delt'],['rhomboids','traps'],['Brust an das Polster, Griffe vor dem Körper.','Arme seitlich nach hinten öffnen.','Langsam zurück.']),
('cable_reverse_fly','Reverse Fly am Kabel','Cable Reverse Fly','Kabelzug',['rear_delt'],['rhomboids'],['Rollen auf Schulterhöhe, Kabel überkreuzt greifen.','Arme leicht gebeugt.','Arme seitlich nach hinten ziehen, langsam zurück.']),
('biceps_machine','Bizeps-Maschine','Machine Biceps Curl','Maschine',['biceps'],['forearms'],['Oberarme auf das Polster.','Griffe zur Schulter beugen.','Langsam strecken.']),
('single_arm_cable_curl','Curls einarmig am Kabel','Single-Arm Cable Curl','Kabelzug',['biceps'],['forearms'],['Rolle unten, einzelner Griff im Untergriff.','Ellbogen am Körper.','Zur Schulter beugen, langsam senken.']),
('rope_hammer_curl','Hammer Curls am Kabel (Seil)','Rope Hammer Curl','Kabelzug',['biceps'],['forearms'],['Rolle unten, Seil im Neutralgriff.','Ellbogen am Körper.','Zur Schulter beugen, langsam senken.']),
('hanging_leg_raise','Beinheben im Hang','Hanging Leg Raise','Körpergewicht',['abs'],['obliques'],['An die Stange hängen.','Beine bzw. Knie kontrolliert anheben.','Langsam senken, nicht schwingen.']),
('torso_rotation_machine','Rumpfdrehen an der Maschine','Machine Torso Rotation','Maschine',['obliques'],['abs'],['Sitz einstellen, Beine fixieren.','Oberkörper gegen den Widerstand drehen.','Langsam zurück, Seite wechseln.']),
]
ALIAS={'Brustpresse am Kabel, sitzend':'cable_chest_press','Smith-Machine-Bankdrücken':'smith_bench','Trizepsdrücken am Kabel':'triceps_pushdown','Holzhacker am Kabel':'cable_woodchop','Pull-Through am Kabel':'cable_pull_through','Latzug-Maschine einarmig':'lat_machine','Latzug einarmig am Kabel':'single_arm_pulldown','Bizeps-Curls am Kabel':'cable_curl','Pallof Press am Kabel':'pallof_press'}
for (id,de,*_) in NEW: byname[de]=id
plan=json.load(open('data/default_plan.json'))
R=[]
for s in plan['sessions']:
    R.append(dict(id=s['id'],name=s['title'],weekday=s['weekday'],start=s['start'],end=s['end'],
      items=[dict(exercise=i['exercise'],sets=i['sets'],reps=i['reps'],rest=90 if i['sets']>=4 else 75) for i in s['items']]))
json.dump({"routines":R},open('data/default_routines.json','w'),ensure_ascii=False,indent=1)
for e in E:
    e['alternatives']=[ALIAS.get(a) or byname[a] for a in e['alternatives']]
    e['plan']=True
for (id,de,en,eq,p,s,st) in NEW:
    alts=[x['id'] for x in E if id in x['alternatives']]
    E.append(dict(id=id,name_de=de,name_en=en,equipment=eq,grip='',muscles=dict(primary=p,secondary=s),steps=st,alternatives=alts,anim=None,plan=False))
for e in E:
    for k in ('session','sets','reps'): e.pop(k,None)
    e['alternatives']=[a for a in dict.fromkeys(e['alternatives']) if a!=e['id']]
ids={e['id'] for e in E}; assert all(a in ids for e in E for a in e['alternatives'])
json.dump({"version":2,"exercises":E},open('data/exercises.json','w'),ensure_ascii=False,indent=1)
print(len(E), 'Übungen,', len(R), 'Routinen')
