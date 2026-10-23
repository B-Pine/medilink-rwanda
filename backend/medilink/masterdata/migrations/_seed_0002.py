# ruff: noqa: E501  (seed tables read better one row per line)
"""Seed data for migration 0002 (contract S1-B13). Frozen with the migration: later changes go
through the platform console or the importers, never by editing this file.

Kinyarwanda strings are best effort and flagged for native-speaker review (issue #11).
Locations below the district level come from the official NISR file via `import_locations`.
"""

# fmt: off
PROVINCES = [
    ("1", "Umujyi wa Kigali"),
    ("2", "Amajyepfo"),
    ("3", "Iburengerazuba"),
    ("4", "Amajyaruguru"),
    ("5", "Iburasirazuba"),
]

DISTRICTS = [
    ("11", "1", "Nyarugenge"), ("12", "1", "Gasabo"), ("13", "1", "Kicukiro"),
    ("21", "2", "Nyanza"), ("22", "2", "Gisagara"), ("23", "2", "Nyaruguru"), ("24", "2", "Huye"),
    ("25", "2", "Nyamagabe"), ("26", "2", "Ruhango"), ("27", "2", "Muhanga"), ("28", "2", "Kamonyi"),
    ("31", "3", "Karongi"), ("32", "3", "Rutsiro"), ("33", "3", "Rubavu"), ("34", "3", "Nyabihu"),
    ("35", "3", "Ngororero"), ("36", "3", "Rusizi"), ("37", "3", "Nyamasheke"),
    ("41", "4", "Rulindo"), ("42", "4", "Gakenke"), ("43", "4", "Musanze"), ("44", "4", "Burera"),
    ("45", "4", "Gicumbi"),
    ("51", "5", "Rwamagana"), ("52", "5", "Nyagatare"), ("53", "5", "Gatsibo"), ("54", "5", "Kayonza"),
    ("55", "5", "Kirehe"), ("56", "5", "Ngoma"), ("57", "5", "Bugesera"),
]

# code = tenancy.FacilityType values
FACILITY_TYPES = [
    ("health_post", "primary", "Poste de santé", "Health post", "Poste de santé"),
    ("health_center", "primary", "Ikigo nderabuzima", "Health center", "Centre de santé"),
    ("district_hospital", "secondary", "Ibitaro by'akarere", "District hospital", "Hôpital de district"),
    ("provincial_hospital", "secondary", "Ibitaro by'intara", "Provincial hospital", "Hôpital provincial"),
    ("referral_hospital", "tertiary", "Ibitaro bikuru", "Referral / teaching hospital", "Hôpital de référence / universitaire"),
    ("private_clinic", "primary", "Ivuriro ryigenga", "Private clinic", "Clinique privée"),
    ("polyclinic", "secondary", "Polikilinike", "Polyclinic", "Polyclinique"),
    ("private_hospital", "secondary", "Ibitaro byigenga", "Private hospital", "Hôpital privé"),
    ("dental_clinic", "primary", "Ivuriro ry'amenyo", "Dental clinic", "Cabinet dentaire"),
    ("eye_clinic", "primary", "Ivuriro ry'amaso", "Eye clinic", "Clinique ophtalmologique"),
    ("diagnostic_center", "secondary", "Ikigo cy'ibizamini", "Diagnostic center", "Centre de diagnostic"),
]

# code, name, scheme, follows_referral_pathway
INSURERS = [
    ("mutuelle", "RSSB Community-Based Health Insurance (Mutuelle de santé)", "community", True),
    ("rama", "RSSB Medical Scheme (RAMA)", "social", True),
    ("mmi", "Military Medical Insurance (MMI)", "military", True),
    ("private_other", "Private insurer (other)", "private", False),
]

# code, rw, en, fr, min_age_months, max_age_months, sex_restriction
SERVICES = [
    ("general_consultation", "Isuzumwa rusange", "General consultation", "Consultation générale", None, None, None),
    ("paediatric_consultation", "Isuzumwa ry'abana", "Paediatric consultation", "Consultation pédiatrique", None, 180, None),
    ("antenatal_care", "Kwipimisha utwite", "Antenatal care", "Consultation prénatale", 144, None, "female"),
    ("postnatal_care", "Gukurikirana nyuma yo kubyara", "Postnatal care", "Soins postnatals", 144, None, "female"),
    ("delivery", "Kubyaza", "Delivery (maternity)", "Accouchement (maternité)", 144, None, "female"),
    ("family_planning", "Kuboneza urubyaro", "Family planning", "Planification familiale", 144, None, None),
    ("vaccination", "Gukingira", "Vaccination", "Vaccination", None, None, None),
    ("growth_monitoring", "Gukurikirana imikurire y'umwana", "Growth monitoring", "Suivi de croissance", None, 60, None),
    ("nutrition_counselling", "Inama ku mirire", "Nutrition counselling", "Conseil nutritionnel", None, None, None),
    ("laboratory_tests", "Ibizamini bya laboratwari", "Laboratory tests", "Analyses de laboratoire", None, None, None),
    ("malaria_test", "Ikizamini cya malariya", "Malaria test", "Test du paludisme", None, None, None),
    ("hiv_testing", "Kwipimisha virusi itera SIDA", "HIV testing and counselling", "Dépistage et conseil VIH", None, None, None),
    ("tb_screening", "Gusuzuma igituntu", "Tuberculosis screening", "Dépistage de la tuberculose", None, None, None),
    ("dental_care", "Kuvura amenyo", "Dental care", "Soins dentaires", None, None, None),
    ("eye_care", "Kuvura amaso", "Eye care", "Soins ophtalmologiques", None, None, None),
    ("ent_consultation", "Isuzumwa ry'amatwi, amazuru n'umuhogo", "Ear, nose and throat consultation", "Consultation ORL", None, None, None),
    ("gynaecology", "Isuzumwa ry'indwara z'abagore", "Gynaecology consultation", "Consultation gynécologique", 144, None, "female"),
    ("internal_medicine", "Indwara zo mu mubiri imbere", "Internal medicine consultation", "Consultation de médecine interne", 180, None, None),
    ("dermatology", "Isuzumwa ry'uruhu", "Dermatology consultation", "Consultation dermatologique", None, None, None),
    ("mental_health", "Ubuzima bwo mu mutwe", "Mental health consultation", "Consultation de santé mentale", None, None, None),
    ("physiotherapy", "Ubugororangingo", "Physiotherapy", "Kinésithérapie", None, None, None),
    ("xray", "Iradiyo (X-ray)", "X-ray", "Radiographie", None, None, None),
    ("ultrasound", "Ekografi", "Ultrasound", "Échographie", None, None, None),
    ("minor_surgery", "Kubaga byoroheje", "Minor surgery", "Petite chirurgie", None, None, None),
    ("wound_care", "Kuvura ibikomere", "Wound dressing", "Pansement", None, None, None),
    ("emergency_care", "Ubutabazi bwihuse", "Emergency care", "Soins d'urgence", None, None, None),
]

# code, title_en, title_fr, plain_en, plain_fr, is_sensitive
DIAGNOSES = [
    ("B54", "Unspecified malaria", "Paludisme, sans précision", "Malaria", "Paludisme", False),
    ("A09", "Infectious gastroenteritis and colitis, unspecified", "Gastro-entérite et colite infectieuses, sans précision", "Stomach and bowel infection", "Infection de l'estomac et de l'intestin", False),
    ("J06.9", "Acute upper respiratory infection, unspecified", "Infection aiguë des voies respiratoires supérieures, sans précision", "Cold or throat infection", "Rhume ou infection de la gorge", False),
    ("J18.9", "Pneumonia, unspecified organism", "Pneumopathie, sans précision", "Lung infection (pneumonia)", "Infection pulmonaire (pneumonie)", False),
    ("I10", "Essential (primary) hypertension", "Hypertension essentielle (primitive)", "High blood pressure", "Tension artérielle élevée", False),
    ("E11.9", "Type 2 diabetes mellitus without complications", "Diabète sucré de type 2, sans complication", "Type 2 diabetes", "Diabète de type 2", False),
    ("D64.9", "Anaemia, unspecified", "Anémie, sans précision", "Low blood count (anaemia)", "Manque de globules rouges (anémie)", False),
    ("N39.0", "Urinary tract infection, site not specified", "Infection des voies urinaires, siège non précisé", "Urine infection", "Infection urinaire", False),
    ("K29.7", "Gastritis, unspecified", "Gastrite, sans précision", "Stomach lining inflammation", "Inflammation de l'estomac", False),
    ("K02.9", "Dental caries, unspecified", "Carie dentaire, sans précision", "Tooth decay", "Carie dentaire", False),
    ("H10.9", "Conjunctivitis, unspecified", "Conjonctivite, sans précision", "Eye infection (pink eye)", "Infection de l'œil", False),
    ("L30.9", "Dermatitis, unspecified", "Dermite, sans précision", "Skin inflammation", "Inflammation de la peau", False),
    ("R50.9", "Fever, unspecified", "Fièvre, sans précision", "Fever", "Fièvre", False),
    ("E44.0", "Moderate protein-energy malnutrition", "Malnutrition protéino-énergétique modérée", "Moderate malnutrition", "Malnutrition modérée", False),
    ("O80", "Single spontaneous delivery", "Accouchement unique et spontané", "Normal birth", "Accouchement normal", False),
    ("Z34.9", "Supervision of normal pregnancy, unspecified", "Surveillance d'une grossesse normale, sans précision", "Pregnancy check-up", "Suivi de grossesse", False),
    ("B20", "HIV disease", "Maladie due au VIH", "HIV", "VIH", True),
    ("A15.0", "Tuberculosis of lung", "Tuberculose pulmonaire", "Lung tuberculosis", "Tuberculose des poumons", True),
    ("F32.9", "Depressive episode, unspecified", "Épisode dépressif, sans précision", "Depression", "Dépression", True),
    ("T14.1", "Open wound of unspecified body region", "Plaie ouverte d'une partie du corps non précisée", "Open wound", "Plaie ouverte", False),
]

# code, rw, en, fr, body_system, icd_code
SYMPTOMS = [
    ("fever", "Umuriro", "Fever", "Fièvre", "general", "R50.9"),
    ("cough", "Inkorora", "Cough", "Toux", "respiratory", "R05"),
    ("headache", "Kurwara umutwe", "Headache", "Mal de tête", "nervous", "R51"),
    ("diarrhoea", "Impiswi", "Diarrhoea", "Diarrhée", "digestive", "R19.7"),
    ("vomiting", "Kuruka", "Vomiting", "Vomissements", "digestive", "R11"),
    ("abdominal_pain", "Kuribwa mu nda", "Abdominal pain", "Douleur abdominale", "digestive", "R10.4"),
    ("chest_pain", "Kuribwa mu gatuza", "Chest pain", "Douleur thoracique", "circulatory", "R07.4"),
    ("shortness_of_breath", "Guhumeka nabi", "Shortness of breath", "Essoufflement", "respiratory", "R06.0"),
    ("sore_throat", "Kuribwa mu muhogo", "Sore throat", "Mal de gorge", "respiratory", "R07.0"),
    ("rash", "Uduheri ku ruhu", "Skin rash", "Éruption cutanée", "skin", "R21"),
    ("fatigue", "Umunaniro", "Tiredness", "Fatigue", "general", "R53"),
    ("joint_pain", "Kuribwa mu ngingo", "Joint pain", "Douleur articulaire", "musculoskeletal", "M25.5"),
    ("back_pain", "Kuribwa mu mugongo", "Back pain", "Mal de dos", "musculoskeletal", "M54.9"),
    ("toothache", "Kuribwa iryinyo", "Toothache", "Mal de dents", "dental", "K08.8"),
    ("eye_pain", "Kuribwa mu jisho", "Eye pain", "Douleur oculaire", "eye", "H57.1"),
    ("dizziness", "Isereri", "Dizziness", "Vertiges", "nervous", "R42"),
    ("bleeding", "Kuva amaraso", "Bleeding", "Saignement", "general", "R58"),
    ("painful_urination", "Kubabara wihagarika", "Painful urination", "Brûlures urinaires", "urinary", "R30.0"),
]

# date, rw, en, fr, is_provisional
HOLIDAYS = []
for _year, _good_friday, _easter_monday, _umuganura, _eid_fitr, _eid_adha in (
    (2026, "04-03", "04-06", "08-07", "03-20", "05-27"),
    (2027, "03-26", "03-29", "08-06", "03-10", "05-16"),
):
    HOLIDAYS += [
        (f"{_year}-01-01", "Ubunani", "New Year's Day", "Jour de l'an", False),
        (f"{_year}-01-02", "Umunsi ukurikira Ubunani", "Day after New Year's Day", "Lendemain du jour de l'an", False),
        (f"{_year}-02-01", "Umunsi w'Intwari", "National Heroes' Day", "Journée des héros nationaux", False),
        (f"{_year}-{_good_friday}", "Ku wa Gatanu Mutagatifu", "Good Friday", "Vendredi saint", False),
        (f"{_year}-{_easter_monday}", "Ku wa Mbere wa Pasika", "Easter Monday", "Lundi de Pâques", False),
        (f"{_year}-04-07", "Umunsi wo Kwibuka Jenoside yakorewe Abatutsi", "Genocide against the Tutsi Memorial Day", "Journée de commémoration du génocide contre les Tutsi", False),
        (f"{_year}-05-01", "Umunsi w'Umurimo", "Labour Day", "Fête du travail", False),
        (f"{_year}-07-01", "Umunsi w'Ubwigenge", "Independence Day", "Fête de l'indépendance", False),
        (f"{_year}-07-04", "Umunsi wo Kwibohora", "Liberation Day", "Fête de la libération", False),
        (f"{_year}-{_umuganura}", "Umuganura", "Umuganura (National Harvest Day)", "Umuganura (fête des récoltes)", False),
        (f"{_year}-08-15", "Asomusiyo", "Assumption Day", "Assomption", False),
        (f"{_year}-12-25", "Noheli", "Christmas Day", "Noël", False),
        (f"{_year}-12-26", "Umunsi ukurikira Noheli", "Boxing Day", "Lendemain de Noël", False),
        (f"{_year}-{_eid_fitr}", "Eid al-Fitr", "Eid al-Fitr", "Aïd el-Fitr", True),
        (f"{_year}-{_eid_adha}", "Eid al-Adha", "Eid al-Adha", "Aïd el-Adha", True),
    ]

# kind -> [(code, rw, en, fr, requires_text)]; every kind of the database design + S1's four
_OTHER = ("other", "Indi mpamvu", "Other reason", "Autre raison", True)
REASON_CODES = {
    "application_rejection": [
        ("invalid_licence", "Uruhushya rutemewe", "Licence invalid or not verifiable", "Licence invalide ou invérifiable", False),
        ("duplicate", "Ubusabe busanzwe buhari", "Duplicate application", "Demande en double", False),
        ("not_a_facility", "Si ikigo cy'ubuvuzi", "Not a health facility", "Pas un établissement de santé", False),
        _OTHER,
    ],
    "facility_suspension": [
        ("licence_expired", "Uruhushya rwarangiye", "Licence expired", "Licence expirée", False),
        ("regulator_order", "Icyemezo cy'urwego rubishinzwe", "Regulator decision", "Décision du régulateur", True),
        ("terms_breach", "Kutubahiriza amasezerano", "Breach of the terms of use", "Violation des conditions d'utilisation", True),
        _OTHER,
    ],
    "facility_reactivation": [
        ("licence_renewed", "Uruhushya rwavuguruwe", "Licence renewed", "Licence renouvelée", False),
        ("issue_resolved", "Ikibazo cyakemutse", "Issue resolved", "Problème résolu", True),
        _OTHER,
    ],
    "facility_deactivation": [
        ("closed", "Ikigo cyafunze", "Facility closed", "Établissement fermé", False),
        ("left_platform", "Cyavuye kuri MediLink", "Left MediLink", "A quitté MediLink", False),
        _OTHER,
    ],
    "dispute": [
        ("billing_error", "Ikosa ku nyemezabuguzi", "Billing error", "Erreur de facturation", False),
        ("service_quality", "Ireme rya serivisi", "Quality of service", "Qualité du service", True),
        _OTHER,
    ],
    "no_show_reversal": [
        ("arrived_late", "Yaje akererewe", "Patient arrived late", "Patient arrivé en retard", False),
        ("recorded_in_error", "Byanditswe nabi", "Recorded in error", "Enregistré par erreur", False),
        _OTHER,
    ],
    "void": [
        ("entered_in_error", "Byinjijwe nabi", "Entered in error", "Saisi par erreur", False),
        ("duplicate", "Byanditswe kabiri", "Duplicate", "Doublon", False),
        _OTHER,
    ],
    "reorder": [
        ("clinical_priority", "Ubukana bw'indwara", "Clinical priority", "Priorité clinique", True),
        _OTHER,
    ],
    "priority": [
        ("emergency", "Ubutabazi bwihuse", "Emergency", "Urgence", False),
        ("elderly", "Umuntu ukuze", "Older person", "Personne âgée", False),
        ("pregnancy", "Utwite", "Pregnancy", "Grossesse", False),
        ("disability", "Ufite ubumuga", "Disability", "Handicap", False),
        _OTHER,
    ],
    "exemption": [
        ("indigent", "Udashoboye kwishyura", "Unable to pay (indigent)", "Indigent", True),
        _OTHER,
    ],
    "access": [
        ("continuity_of_care", "Gukomeza kuvura", "Continuity of care", "Continuité des soins", False),
        ("patient_request", "Umurwayi yabisabye", "At the patient's request", "À la demande du patient", False),
        _OTHER,
    ],
    "break_glass": [
        ("emergency_treatment", "Kuvura byihutirwa", "Emergency treatment", "Traitement d'urgence", True),
        ("patient_unconscious", "Umurwayi ntiyumva", "Patient unconscious", "Patient inconscient", True),
    ],
}
# fmt: on
