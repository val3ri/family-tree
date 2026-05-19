"""
Примерни данни: три поколения семейство Иванови
"""
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8000"


def post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


persons = [
    # Поколение 1 - баби и дядовци
    {"first_name": "Георги",    "last_name": "Иванов",    "birth_date": "1940-03-15", "bio": "Роден в Пловдив. Работил като учител по математика 40 години."},
    {"first_name": "Мария",     "last_name": "Иванова",   "birth_date": "1943-07-22", "bio": "Домакиня и майка на три деца. Страстен готвач."},
    {"first_name": "Петър",     "last_name": "Георгиев",  "birth_date": "1938-11-05", "bio": "Инженер строител. Пенсионер от 2003 г."},
    {"first_name": "Елена",     "last_name": "Георгиева", "birth_date": "1942-04-18", "death_date": "2018-09-01", "bio": "Обичана баба и съпруга. Починала от болест."},

    # Поколение 2 - родители
    {"first_name": "Иван",      "last_name": "Иванов",    "birth_date": "1968-06-10", "bio": "Архитект. Живее в София с жена си и двете си деца."},
    {"first_name": "Снежана",   "last_name": "Иванова",   "birth_date": "1970-02-28", "bio": "Лекар-педиатър в УМБАЛ Александровска."},
    {"first_name": "Николай",   "last_name": "Иванов",    "birth_date": "1972-09-14", "bio": "Предприемач. Занимава се с IT бизнес."},
    {"first_name": "Десислава", "last_name": "Иванова",   "birth_date": "1965-12-03", "bio": "Сестра на Иван и Николай. Живее в Пловдив."},

    # Поколение 3 - деца
    {"first_name": "Александър","last_name": "Иванов",    "birth_date": "1995-04-20", "bio": "Студент по компютърни науки. Интересува се от музика."},
    {"first_name": "Виктория",  "last_name": "Иванова",   "birth_date": "1998-08-15", "bio": "Дизайнер на графика. Работи фрийланс."},
    {"first_name": "Мартин",    "last_name": "Иванов",    "birth_date": "2001-01-30", "bio": "Ученик в 12 клас. Спортува баскетбол."},
]

print("Добавяне на хора...")
ids = {}
for p in persons:
    person = post("/persons/", p)
    key = f"{p['first_name']} {p['last_name']}"
    ids[key] = person["id"]
    print(f"  ✓ {key}")


def rel(a, b, rtype):
    post("/relations/", {
        "person_a_id": ids[a],
        "person_b_id": ids[b],
        "relation_type": rtype
    })

print("\nДобавяне на връзки...")

# Съпрузи поколение 1
rel("Георги Иванов",    "Мария Иванова",     "SPOUSE")
rel("Петър Георгиев",   "Елена Георгиева",   "SPOUSE")

# Деца на Георги и Мария
rel("Георги Иванов",    "Иван Иванов",       "PARENT_CHILD")
rel("Мария Иванова",    "Иван Иванов",       "PARENT_CHILD")
rel("Георги Иванов",    "Николай Иванов",    "PARENT_CHILD")
rel("Мария Иванова",    "Николай Иванов",    "PARENT_CHILD")
rel("Георги Иванов",    "Десислава Иванова", "PARENT_CHILD")
rel("Мария Иванова",    "Десислава Иванова", "PARENT_CHILD")

# Братя/сестри поколение 2
rel("Иван Иванов",      "Николай Иванов",    "SIBLING")
rel("Иван Иванов",      "Десислава Иванова", "SIBLING")
rel("Николай Иванов",   "Десислава Иванова", "SIBLING")

# Съпрузи поколение 2
rel("Иван Иванов",      "Снежана Иванова",   "SPOUSE")

# Деца на Иван и Снежана
rel("Иван Иванов",      "Александър Иванов", "PARENT_CHILD")
rel("Снежана Иванова",  "Александър Иванов", "PARENT_CHILD")
rel("Иван Иванов",      "Виктория Иванова",  "PARENT_CHILD")
rel("Снежана Иванова",  "Виктория Иванова",  "PARENT_CHILD")

# Дете на Николай
rel("Николай Иванов",   "Мартин Иванов",     "PARENT_CHILD")

# Братя/сестри поколение 3
rel("Александър Иванов","Виктория Иванова",  "SIBLING")

print("  ✓ Всички връзки добавени")
print("\nГотово! Отвори http://localhost за да видиш семейното дърво.")
