# Развёртывание RouteGuard v2 на SprintHost

Архив `routeguard-v2-sprinthost.zip` загружается **рядом с `public_html`**, в корень аккаунта, и распаковывается там. Внутри уже лежат две папки: `routeguard_app` (закрытое приложение и `.env`) и `public_html` (WSGI-точка входа и статические файлы).

> Перед распаковкой сделайте копию существующего `public_html` и экспорт базы. Не удаляйте PHP-версию до smoke-check v2.

## Совместимость

Выбраны Python 3.11, Django 5.2 LTS и PostgreSQL 14. SprintHost документирует Python-приложения через Apache/uWSGI и поддержку этих версий. Node.js в production не нужен: React уже собран в статические файлы.

## Установка

1. Загрузите архив в корень аккаунта — на один уровень выше `public_html`.
2. Распакуйте его с объединением папки `public_html`, не удаляя резервную копию.
3. По SSH выполните (замените `/home/LOGIN` на путь аккаунта):

```bash
cd /home/LOGIN/routeguard_app
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
DJANGO_STATIC_ROOT=/home/LOGIN/public_html/static .venv/bin/python manage.py collectstatic --noinput
.venv/bin/python manage.py create_workspace --name "RouteGuard" --username OWNER --password 'UNIQUE-LONG-PASSWORD'
chmod 755 /home/LOGIN/public_html/site.wsgi
```

4. Проверьте путь к virtualenv в `public_html/site.wsgi`. Шаблон ищет `routeguard_app/.venv` автоматически.
5. Откройте сайт по HTTPS. Проверьте `/api/health/`, лендинг, демо и вход сотрудника.
6. Добавьте cron-задачу раз в сутки:

```bash
/home/LOGIN/routeguard_app/.venv/bin/python /home/LOGIN/routeguard_app/manage.py cleanup_demo
```

## База и секреты

Локально собранный приватный архив содержит введённые реквизиты в `routeguard_app/.env`; этот файл расположен вне `public_html` и исключён из Git. Если созданная в панели база имеет тип **MySQL**, создайте отдельную PostgreSQL 14 базу: v2 намеренно использует PostgreSQL для ограничений и корректного конкурентного бронирования.

После первой загрузки смените пароль базы, обновите `DATABASE_URL` и перезапустите приложение. Никогда не переносите `.env` в `public_html`.

## Проверка

- `https://DOMAIN/api/health/` возвращает `{"status":"ok"}`;
- новое демо содержит P001–P020;
- P016 создаёт задачу повторного звонка;
- P002 занимает только один будущий слот;
- в браузере нет 500 и ошибок console;
- `https://DOMAIN/.env` и `/routeguard_app/` недоступны;
- страницы не имеют общей горизонтальной прокрутки на 390/768/1280/1440 px.

## Обновление и FIX

В архиве находится `public_html/FIX/fix.php` — один самодостаточный PHP-файл с текущим файловым payload и контрольной SHA-256. Он создаёт резервную копию затрагиваемых файлов и распаковывает версию в корень аккаунта. Предпочтительный запуск по SSH:

```bash
php /home/LOGIN/public_html/FIX/fix.php
```

Веб-запуск требует случайный токен, напечатанный сборщиком архива. После файлового обновления всё равно вручную выполните `pip install`, `migrate`, `collectstatic`, smoke-check и удалите/закройте веб-доступ к fixer до следующего релиза.

## Откат

Верните сохранённый `public_html`, предыдущий `routeguard_app` и дамп БД. Полный порядок описан в [MIGRATION.md](MIGRATION.md).

Официальные справки: [Python на SprintHost](https://help.sprinthost.ru/howto/python), [Django на SprintHost](https://help.sprinthost.ru/framework/django), [параметры серверов](https://help.sprinthost.ru/faq/server-settings), [Django 5.2 LTS](https://docs.djangoproject.com/en/5.2/releases/5.2/).
