<div align="center">

<img src="public/icon.png" width="96" height="96" alt="Phantom VPN" />

# Phantom VPN

**Бесплатный VPN для Windows 10/11. Без логов. Без регистрации. Навсегда.**

[Скачать](https://github.com/XXxilusha/phantom-vpn/releases/latest) ·
[Сайт](https://xxxilusha.github.io/phantom-vpn/) ·
[FAQ](https://xxxilusha.github.io/phantom-vpn/#faq)

![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Size](https://img.shields.io/badge/size-~85MB-orange?style=flat-square)
![Free](https://img.shields.io/badge/price-free%20forever-purple?style=flat-square)

</div>

---

Phantom VPN — это бесплатный портативный VPN-клиент для Windows на базе сети **Cloudflare WARP**. Без подписок, без аккаунтов, без рекламы. Один `.exe` файл — запустил и защищён.

## Что внутри

- **Постквантовое шифрование** — защита от атак квантовых компьютеров
- **Нулевые логи** — никакая активность не сохраняется (Cloudflare прошла аудит KPMG)
- **Cloudflare WARP** — глобальная сеть с серверами в 300+ городах
- **Kill Switch** — мгновенно блокирует интернет при разрыве VPN
- **DNS-фильтр** — блокировка малвари, фишинга и 18+ контента на уровне DNS
- **Split-туннелирование** — список доменов в обход VPN (банки, локальные сервисы)
- **Lock Endpoint** — закрепление статичного IP-адреса
- **Авто-подключение и автозапуск** с Windows
- **Без регистрации** — ни email, ни телефон, ни карта

## Установка

1. Скачайте [последний релиз](https://github.com/XXxilusha/phantom-vpn/releases/latest) — `.exe` файл (~85 МБ)
2. Запустите. При первом запуске приложение автоматически установит Cloudflare WARP (потребуется UAC)
3. Нажмите кнопку питания — готово, трафик шифруется

## Системные требования

- Windows 10 или Windows 11
- 64-bit архитектура
- Права администратора при первом запуске (для установки WARP)

## Сравнение

| | Phantom VPN | ExpressVPN | NordVPN | ProtonVPN Free |
|---|---|---|---|---|
| Цена | **Бесплатно** | $13/мес | $13/мес | Бесплатно |
| Логи | Нет | Нет | Нет | Нет |
| Регистрация | **Не нужна** | Аккаунт | Аккаунт | Email |
| Постквантовое шифрование | ✅ | ❌ | ❌ | ❌ |
| Лимит трафика | Нет | Нет | Нет | Нет |
| Kill Switch | ✅ | ✅ | ✅ | ✅ |
| Split-туннелирование | ✅ | ✅ | ✅ | ❌ |

## Технологии

- [Electron](https://www.electronjs.org/) — нативная обёртка для Windows
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) — UI
- [Framer Motion](https://www.framer.com/motion/) — анимации
- [Tailwind CSS](https://tailwindcss.com/) — стили
- [Cloudflare WARP](https://1.1.1.1/) — VPN-сеть

## Разработка

```bash
git clone https://github.com/XXxilusha/phantom-vpn.git
cd phantom-vpn
npm install

# Dev режим (Vite + Electron)
npm run electron:dev

# Сборка релиза
npm run build
npm run electron:build
```

## FAQ

**Это правда бесплатно?**
Да. Phantom VPN — обёртка над бесплатной сетью Cloudflare WARP. Никаких подписок, навсегда.

**Сохраняются ли мои данные?**
Нет. Cloudflare WARP не ведёт логов трафика — это подтверждено независимым аудитом KPMG. Phantom VPN сам по себе никуда ничего не отправляет.

**Работает ли в Беларуси / России?**
Да. WARP использует протокол MASQUE поверх HTTPS — трафик неотличим от обычного веб-трафика, что обеспечивает стабильную работу в регионах с ограничениями.

**Почему .exe такой большой (~85 МБ)?**
В нём упакован Electron runtime (Chromium + Node.js). Это цена за нативный Windows-клиент с хорошим UI.

**Можно ли выбрать страну?**
В бесплатной версии WARP страна не выбирается — Cloudflare сама подбирает ближайший дата-центр. Но можно "закрепить" текущий endpoint через функцию Lock Endpoint.

## Лицензия

MIT © [XXxilusha](https://github.com/XXxilusha)

---

<div align="center">

*Phantom VPN — Сквозь туман, незримы*

</div>
