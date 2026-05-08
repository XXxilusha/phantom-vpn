# Phantom VPN — Полное руководство по установке

## Архитектура

```
[Твой ПК] ←— WireGuard Tunnel —→ [Бесплатный сервер Oracle Cloud]
    ↕                                        ↕
 GUI (Electron)                    WireGuard Server
 React + Tailwind                  UDP :51820
 Glassmorphism UI                  Full tunnel (0.0.0.0/0)
```

## Что нужно (всё бесплатно)

| Компонент | Решение | Стоимость |
|-----------|---------|-----------|
| Сервер | Oracle Cloud Free Tier | $0 навсегда |
| Протокол | WireGuard | Open Source |
| GUI | Electron + React | Open Source |
| DNS | Cloudflare 1.1.1.1 | $0 |

---

## Шаг 1: Получи бесплатный сервер

### Oracle Cloud (рекомендуется)

1. Зайди на https://cloud.oracle.com и создай аккаунт
2. Понадобится банковская карта для верификации (деньги НЕ списываются)
3. Выбери Home Region ближе к тебе (например Frankfurt для EU)
4. Создай VM Instance:
   - **Compute → Instances → Create Instance**
   - Image: **Ubuntu 22.04**
   - Shape: **VM.Standard.A1.Flex** (ARM — 4 CPU, 24GB RAM бесплатно!)
   - Или **VM.Standard.E2.1.Micro** (AMD — 1 CPU, 1GB RAM)
   - Скачай SSH-ключ (.pem файл) при создании

5. **ВАЖНО** — Открой порт WireGuard:
   - Virtual Cloud Network → Security Lists → Default
   - Add Ingress Rule:
     - Source: `0.0.0.0/0`
     - Protocol: UDP
     - Port: `51820`

6. Запиши **Public IP** инстанса

### Альтернатива: Google Cloud

1. https://cloud.google.com → Free Tier
2. Создай **e2-micro** VM (free tier: 1 vCPU, 1GB RAM)
3. Firewall: открой UDP 51820
4. SSH-ключ генерируется автоматически

### Альтернатива: Cloudflare WARP (без сервера)

1. https://one.one.one.one → скачай WARP клиент
2. Это самый простой вариант, но без полного контроля
3. Подходит для базового обхода блокировок

---

## Шаг 2: Разверни WireGuard на сервере

### Вариант A: Автоматически через GUI

1. Открой приложение: `npm run dev` (или `npm run electron:dev`)
2. Вкладка **Config**: введи IP сервера, путь к SSH-ключу
3. Вкладка **Setup**: нажми **Deploy WireGuard**
4. Дождись завершения в логах

### Вариант B: Через командную строку

```bash
# Из папки проекта:
bash scripts/deploy-remote.sh <SERVER_IP> <PATH_TO_SSH_KEY>

# Пример:
bash scripts/deploy-remote.sh 129.213.45.67 ~/.ssh/oracle_key.pem
```

### Вариант C: Вручную через SSH

```bash
ssh -i your_key.pem ubuntu@<SERVER_IP>
# На сервере:
curl -sL https://raw.githubusercontent.com/user/repo/main/scripts/deploy-wireguard.sh | bash
```

---

## Шаг 3: Подключись

### Через GUI (рекомендуется)

```bash
cd vpn
npm install
npm run dev          # веб-версия на http://localhost:5173
npm run electron:dev # десктоп приложение
```

### Через официальный WireGuard клиент

1. Скачай: https://wireguard.com/install
2. Import tunnel → выбери файл `wireguard-client.conf`
3. Activate

### Через PowerShell (Windows)

```powershell
.\scripts\connect-wireguard.ps1
# Отключиться:
.\scripts\connect-wireguard.ps1 -Disconnect
```

---

## Шаг 4 (опционально): VLESS для обхода DPI

Если WireGuard блокируется провайдером, используй VLESS + Reality:

```bash
bash scripts/deploy-remote.sh <SERVER_IP> <SSH_KEY>
# Затем на сервере:
bash scripts/deploy-xray-vless.sh
```

Полученную VLESS-ссылку импортируй в:
- **Windows**: Nekoray, v2rayN
- **Android**: v2rayNG, Hiddify
- **iOS**: Shadowrocket, Streisand
- **macOS**: V2BOX

---

## Структура проекта

```
vpn/
├── src/                    # React UI
│   ├── components/         # Компоненты интерфейса
│   │   ├── Header.jsx
│   │   ├── ConnectionButton.jsx
│   │   ├── StatusPanel.jsx
│   │   ├── StatsPanel.jsx
│   │   ├── ServerSetup.jsx
│   │   ├── ConfigPanel.jsx
│   │   └── LogPanel.jsx
│   ├── lib/
│   │   └── vpnManager.js  # Логика подключения и деплоя
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css           # Tailwind + Glassmorphism стили
├── electron/
│   └── main.js             # Electron main process
├── scripts/
│   ├── deploy-wireguard.sh # Автоустановка WireGuard
│   ├── deploy-xray-vless.sh# VLESS + Reality установка
│   ├── deploy-remote.sh    # Деплой с локальной машины
│   └── connect-wireguard.ps1 # Windows подключение
├── package.json
├── vite.config.js
├── tailwind.config.js
└── SETUP_GUIDE.md          # Эта инструкция
```

---

## API-ключи и доступы

| Что нужно | Где получить | Куда вставить |
|-----------|-------------|---------------|
| Oracle Cloud аккаунт | cloud.oracle.com | Только для создания VM |
| SSH-ключ (.pem) | Скачивается при создании VM | Config → SSH Private Key Path |
| Public IP сервера | Oracle Dashboard → Instance | Config → Server Host |
| SSH username | `ubuntu` (Oracle), `root` (другие) | Config → SSH User |

**Никаких платных API-ключей не требуется.** Всё работает через SSH + WireGuard.

---

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Не подключается | Проверь что порт UDP 51820 открыт в Security List |
| Медленный VPN | Попробуй сервер ближе к тебе, уменьши MTU до 1280 |
| Блокируется провайдером | Используй VLESS + Reality (скрипт deploy-xray-vless.sh) |
| SSH timeout | Проверь IP, ключ и что инстанс запущен |
| WireGuard не ставится | Убедись что Ubuntu 20.04+ |
