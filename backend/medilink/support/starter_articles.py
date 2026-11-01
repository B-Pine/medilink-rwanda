"""Starter help articles for development and demos (contract sprint-10 §1.1).

Plain text: a blank line separates paragraphs, "- " starts a list item (contract §2.4).
Kinyarwanda texts need native-speaker review before they are published on staging.
"""

from __future__ import annotations

from typing import Any

ARTICLES: list[dict[str, Any]] = [
    {
        "slug": "i-cant-sign-in",
        "audience": "patient",
        "category": "account_security",
        "sort_order": 10,
        "title_i18n": {
            "rw": "Sinshobora kwinjira",
            "en": "I can't sign in",
            "fr": "Je n'arrive pas à me connecter",
        },
        "summary_i18n": {
            "rw": "Uko wahindura ijambo ry'ibanga cyangwa ugasaba ubufasha.",
            "en": "How to reset your password or get help in person.",
            "fr": "Comment réinitialiser votre mot de passe ou obtenir de l'aide sur place.",
        },
        "body_i18n": {
            "rw": "Niba wibagiwe ijambo ry'ibanga, kanda \"Nibagiwe ijambo ry'ibanga\" ku rupapuro "
            "rwo kwinjira.\n\n- Andika imeri wakoresheje wiyandikisha.\n- Fungura ubutumwa "
            "twakoherereje ukurikize umurongo.\n- Hitamo ijambo ry'ibanga rishya.\n\nNiba "
            "bitakunze, baza ku kwakira abarwayi ku ivuriro iryo ari ryo ryose rikoresha MediLink.",
            "en": 'If you forgot your password, choose "Forgot password" on the sign-in page.'
            "\n\n- Enter the email you signed up with.\n- Open the message we send and follow "
            "the link.\n- Choose a new password.\n\nStill stuck? Ask at reception at any "
            "MediLink facility.",
            "fr": "Si vous avez oublié votre mot de passe, choisissez « Mot de passe oublié » sur "
            "la page de connexion.\n\n- Saisissez l'adresse e-mail de votre inscription.\n- "
            "Ouvrez le message reçu et suivez le lien.\n- Choisissez un nouveau mot de passe."
            "\n\nToujours bloqué ? Demandez à l'accueil de n'importe quel établissement MediLink.",
        },
    },
    {
        "slug": "add-a-child",
        "audience": "patient",
        "category": "family_profile",
        "sort_order": 20,
        "title_i18n": {
            "rw": "Kongeraho umwana wawe",
            "en": "Add your child",
            "fr": "Ajouter votre enfant",
        },
        "summary_i18n": {
            "rw": "Kurikirana gahunda z'umwana wawe ukoresheje konti yawe.",
            "en": "Follow your child's visits from your own account.",
            "fr": "Suivez les visites de votre enfant depuis votre compte.",
        },
        "body_i18n": {
            "rw": 'Fungura Umuryango, hanyuma ukande "Ongeraho umwana".\n\n- Andika amazina '
            "n'itariki y'amavuko.\n- Emeza ko uri umubyeyi cyangwa umurera.\n\nUshobora "
            "guhindura umwirondoro uri hejuru ya ecran.",
            "en": 'Open Family and choose "Add a child".\n\n- Enter the name and date of '
            "birth.\n- Confirm that you are the parent or guardian.\n\nSwitch between profiles "
            "from the top of the screen.",
            "fr": "Ouvrez Famille et choisissez « Ajouter un enfant ».\n\n- Saisissez le nom et "
            "la date de naissance.\n- Confirmez que vous êtes le parent ou le tuteur.\n\n"
            "Passez d'un profil à l'autre en haut de l'écran.",
        },
    },
    {
        "slug": "follow-your-turn",
        "audience": "patient",
        "category": "booking_visits",
        "sort_order": 30,
        "title_i18n": {
            "rw": "Gukurikirana igihe cyawe",
            "en": "Follow your turn",
            "fr": "Suivre votre tour",
        },
        "summary_i18n": {
            "rw": "Reba umubare w'itike yawe n'abakuri imbere.",
            "en": "See your ticket number and how many people are ahead.",
            "fr": "Voyez votre numéro de ticket et le nombre de personnes avant vous.",
        },
        "body_i18n": {
            "rw": "Iyo ukiriwe ku ivuriro, fungura Gahunda zanjye. Uzabona umubare w'itike yawe "
            "n'igihe ugomba gutegereza.\n\nTuzakumenyesha igihe cyawe kigeze.",
            "en": "After reception checks you in, open My visits. Your ticket number and the "
            "expected wait are there.\n\nWe tell you when you're next.",
            "fr": "Après votre enregistrement à l'accueil, ouvrez Mes visites. Votre numéro de "
            "ticket et l'attente prévue y figurent.\n\nNous vous prévenons quand c'est bientôt "
            "votre tour.",
        },
    },
    {
        "slug": "contact-medilink-support",
        "audience": "staff",
        "category": "getting_started",
        "sort_order": 10,
        "title_i18n": {
            "rw": "Gusaba ubufasha bwa MediLink",
            "en": "Ask MediLink support",
            "fr": "Contacter le support MediLink",
        },
        "summary_i18n": {
            "rw": "Igihe n'uko wasaba ubufasha, n'ibyo utagomba kwandika.",
            "en": "When and how to ask for help, and what not to include.",
            "fr": "Quand et comment demander de l'aide, et ce qu'il ne faut pas inclure.",
        },
        "body_i18n": {
            "rw": 'Fungura Ubufasha, hanyuma "Icyifuzo gishya".\n\n- Sobanura ibyo wakoze '
            "n'ibyabaye.\n- Ntukandike amakuru y'ubuzima bw'abarwayi.\n\nUmuyobozi w'ivuriro "
            "ryawe ashobora kubona icyifuzo cyawe.",
            "en": 'Open Help and support, then "New request".\n\n- Describe what you did and '
            "what happened.\n- Never include patients' health details.\n\nYour facility admin "
            "can see your request.",
            "fr": "Ouvrez Aide et support, puis « Nouvelle demande ».\n\n- Décrivez ce que vous "
            "avez fait et ce qui s'est passé.\n- N'incluez jamais de détails de santé des "
            "patients.\n\nL'administrateur de votre établissement peut voir votre demande.",
        },
    },
]
