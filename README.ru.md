# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google Apps Script MCP

[English](./README.md) | **Русский**

[![npm](https://img.shields.io/npm/v/mcp-google-apps-script)](https://www.npmjs.com/package/mcp-google-apps-script)
[![CI](https://github.com/A1-x-Tech/mcp-google-apps-script/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-apps-script/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-apps-script/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-apps-script)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A1 Google Apps Script MCP** позволяет AI-приложению писать и сопровождать Google Apps Script на естественном языке. Можно создать проект скрипта, прочитать и изменить его код, зафиксировать версии, управлять деплоями, запускать функции и читать историю выполнений.

Сервер работает с Google Apps Script API через ваш Google-аккаунт. Он отличает редактируемый код HEAD от неизменяемых версий и явно показывает ограничения Apps Script API, а не создаёт впечатление, что через скрипты можно сделать всё.

- **13 инструментов.** Создание standalone- и привязанных проектов, чтение и обновление файлов кода, фиксация неизменяемых версий, управление деплоями, запуск функций, история выполнений и метрики.
- **Версии неизменяемы.** Версия — это снимок HEAD, который нельзя ни изменить, ни удалить; деплои указывают на версии, поэтому выкатка и откат не меняют URL.
- **Манифест всегда выживает.** Режим merge сохраняет манифест `appsscript` и все файлы, которые вы не упомянули; режим replace отклоняет набор файлов без манифеста ещё до обращения к сети.
- **Храните scriptId.** API не умеет ни перечислять проекты, ни удалять их — `scriptId` из ответа `create_project` остаётся единственной ссылкой на проект.
- **Минимальные scope Google.** У каждой операции свой scope (`script.projects`, `script.deployments`, `script.processes`, `script.metrics`); запрашивайте только то, что нужно вашим задачам.

Начните с запроса, который только читает данные:

> Покажи файлы моего скрипта отчётов и какие функции упали на этой неделе.

[Подключить сервер](#быстрый-старт) · [Посмотреть сценарии](#что-можно-поручить) · [Открыть техническую документацию](#техническая-документация)

---

## Увидеть работу за минуту

> **Вы:** Покажи код и последние запуски моего скрипта отчётов.
>
> **Ассистент:** Показывает все файлы с исходниками и историю выполнений — какие функции запускались, когда и какие упали. Ничего не меняется.
>
> **Вы:** Добавь в файл Utils функцию-помощник `formatDate`, остальное не трогай.
>
> **Ассистент:** Показывает предлагаемый код, подтверждает, что режим merge не затрагивает остальные файлы, и запрашивает подтверждение перед записью.
>
> **Вы:** Подтверждаю.
>
> **Ассистент:** Записывает файл в HEAD. Он не создаёт версию, не деплоит и ничего не запускает, пока вы не попросите об этом отдельно.

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Что можно поручить](#что-можно-поручить)
- [Как меняется проект](#как-меняется-проект)
- [Что может измениться](#что-может-измениться)
- [Как получить доступ](#как-получить-доступ)
- [Конфигурация](#конфигурация)
- [Данные, лимиты и работа в фоне](#данные-лимиты-и-работа-в-фоне)
- [Техническая документация](#техническая-документация)
- [Поддержка](#поддержка)

## Быстрый старт

Нужны Node.js 20+, Google-аккаунт и OAuth-данные из проекта Google Cloud с включённым Google Apps Script API.

1. [Подготовьте Google OAuth-доступ](#как-получить-доступ).
2. Добавьте сервер в AI-приложение.
3. Отправьте запрос, который только читает данные.

<details open>
<summary><strong>Codex</strong></summary>

<br>

**В приложении:** откройте **Settings → MCP servers**, нажмите **Add server**, выберите **STDIO**, укажите команду `npx -y mcp-google-apps-script@latest` и переменные окружения `GOOGLE_APPS_SCRIPT_CLIENT_ID`, `GOOGLE_APPS_SCRIPT_CLIENT_SECRET`, `GOOGLE_APPS_SCRIPT_REFRESH_TOKEN`, затем нажмите **Save**, потом **Restart**.

**В командной строке:**

```bash
codex mcp add google-apps-script \
  --env GOOGLE_APPS_SCRIPT_CLIENT_ID=your_client_id \
  --env GOOGLE_APPS_SCRIPT_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_APPS_SCRIPT_REFRESH_TOKEN=your_refresh_token \
  -- npx -y mcp-google-apps-script@latest
```

```bash
codex mcp list
```

[Документация Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

```bash
claude mcp add \
  --env GOOGLE_APPS_SCRIPT_CLIENT_ID=your_client_id \
  --env GOOGLE_APPS_SCRIPT_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_APPS_SCRIPT_REFRESH_TOKEN=your_refresh_token \
  --transport stdio --scope user google-apps-script \
  -- npx -y mcp-google-apps-script@latest
```

```bash
claude mcp list
```

[Документация Claude Code MCP](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

<br>

Актуальный официальный путь — **Settings → Extensions**. Для пользовательского desktop extension откройте **Advanced settings → Extension Developer → Install Extension…**, выберите файл `.mcpb` и следуйте подсказкам.

Этот репозиторий сейчас публикует npm-пакет со stdio и пока не содержит `.mcpb`. Поэтому используйте приведённый ниже JSON stdio-конфиг как fallback только в сборках Claude Desktop, где ещё поддерживается локальная конфигурация:

```json
{
  "mcpServers": {
    "google-apps-script": {
      "command": "npx",
      "args": ["-y", "mcp-google-apps-script@latest"],
      "env": {
        "GOOGLE_APPS_SCRIPT_CLIENT_ID": "your_client_id",
        "GOOGLE_APPS_SCRIPT_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_APPS_SCRIPT_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

В таких сборках сохраните его в `~/Library/Application Support/Claude/claude_desktop_config.json` на macOS или `%APPDATA%\Claude\claude_desktop_config.json` на Windows.

[Документация Claude Desktop MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

</details>

<details>
<summary><strong>Cursor</strong></summary>

<br>

Добавьте в `~/.cursor/mcp.json` на macOS/Linux или `%USERPROFILE%\.cursor\mcp.json` на Windows:

```json
{
  "mcpServers": {
    "google-apps-script": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-google-apps-script@latest"],
      "env": {
        "GOOGLE_APPS_SCRIPT_CLIENT_ID": "your_client_id",
        "GOOGLE_APPS_SCRIPT_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_APPS_SCRIPT_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

[Документация Cursor MCP](https://cursor.com/docs/mcp)

</details>

<details>
<summary><strong>VS Code</strong></summary>

<br>

Запустите **MCP: Open User Configuration** и добавьте:

```json
{
  "servers": {
    "google-apps-script": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-google-apps-script@latest"],
      "env": {
        "GOOGLE_APPS_SCRIPT_CLIENT_ID": "${input:apps_script_client_id}",
        "GOOGLE_APPS_SCRIPT_CLIENT_SECRET": "${input:apps_script_client_secret}",
        "GOOGLE_APPS_SCRIPT_REFRESH_TOKEN": "${input:apps_script_refresh_token}"
      }
    }
  },
  "inputs": [
    { "type": "promptString", "id": "apps_script_client_id", "description": "Google OAuth client ID" },
    { "type": "promptString", "id": "apps_script_client_secret", "description": "Google OAuth client secret", "password": true },
    { "type": "promptString", "id": "apps_script_refresh_token", "description": "Google OAuth refresh token", "password": true }
  ]
}
```

Проверьте сервер командой **MCP: List Servers**.

[Документация VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

## Что можно поручить

### Проверить проект и его запуски

- Покажи файлы этого скрипта и объясни, что делает каждая функция.
- Какие функции упали на этой неделе? Покажи историю выполнений `sendDigest`.
- Сколько пользователей, запусков и сбоев было у этого скрипта за последние 7 дней?

### Писать и развивать код

- Создай standalone-проект или скрипт, привязанный к документу, таблице, презентации или форме.
- Добавь функцию-помощник в один файл, не трогая остальные.
- Зафиксируй текущий код как версию с описанием, прежде чем мы начнём рефакторинг.

### Выкатывать, запускать и откатывать

- Задеплой версию 4 и покажи её точки входа — URL веб-приложения или конфигурацию API executable.
- Запусти `sendDigest` и покажи результат; если скрипт бросил исключение — покажи стек.
- Переключи деплой обратно на версию 3, не меняя его URL.

## Как меняется проект

1. `create_project` создаёт **проект** — standalone или привязанный к документу, таблице, презентации или форме. Сохраните полученный `scriptId`: API не умеет перечислять проекты.
2. Код живёт в **HEAD** в виде файлов, которые адресуются именем без расширения. `update_project_content` по умолчанию работает в режиме merge — обновляет названные файлы и сохраняет остальные — и заменяет весь набор только по явной просьбе; манифест `appsscript` удалить нельзя никогда.
3. `create_version` фиксирует HEAD как **неизменяемую версию** — без правок и удаления, номера только растут.
4. **Деплой** открывает версию как веб-приложение или API executable. Обновление деплоя переключает его на другую версию, не меняя URL; автоматический деплой `@HEAD` удалить нельзя.

Удалить проект через API тоже нельзя — для этого нужно удалить его файл в Drive, чего этот сервер не делает. `run_function` требует деплоя типа API executable, OAuth-клиента из того же проекта Cloud, что и скрипт, и scope самого скрипта в токене; Apps Script останавливает любое выполнение через 6 минут. История выполнений показывает статус и время, но не тексты ошибок — они живут в Cloud Logging или получаются повторным запуском функции.

## Что может измениться

| Операция | Что происходит | Граница подтверждения |
|---|---|---|
| Чтение проекта, его кода, версий, запусков или метрик | Читает данные | Ничего не меняет |
| Создание проекта | Добавляет standalone- или привязанный проект скрипта | Меняет Google Apps Script |
| Обновление файлов проекта | Перезаписывает код в HEAD; режим replace заменяет весь набор файлов | Меняет проект |
| Создание версии | Добавляет неизменяемый снимок, который нельзя удалить | Меняет проект |
| Создание или обновление деплоя | Меняет то, что отдаёт рабочий URL или API-endpoint | Меняет живое поведение проекта |
| Удаление деплоя | Навсегда ломает URL деплоя | Разрушительно |
| Запуск функции | Выполняет реальный код с реальными побочными эффектами | Разрушительно |
| Технический запрос API | Может вызвать метод API без отдельного инструмента | Потенциально разрушительно |

Как AI-приложение просит подтверждение, определяет само приложение. Сервер помечает операции чтения, записи и удаления, чтобы оно отличило проверку от рабочего изменения.

## Как получить доступ

Google Apps Script API требует OAuth 2.0: одного API-ключа недостаточно.

1. Создайте или выберите проект Google Cloud и включите **Google Apps Script API**.
2. Включите переключатель на уровне аккаунта на странице [script.google.com/home/usersettings](https://script.google.com/home/usersettings) — без него каждый вызов завершается ошибкой `403`.
3. Настройте OAuth consent screen и создайте OAuth-клиент типа **Desktop app**.
4. Авторизуйте Google-аккаунт, которому принадлежат скрипты. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) поможет получить refresh token, если включить **Use your own OAuth credentials**.
5. Запросите scope для тех инструментов, которыми собираетесь пользоваться:

   ```text
   https://www.googleapis.com/auth/script.projects
   https://www.googleapis.com/auth/script.deployments
   https://www.googleapis.com/auth/script.processes
   https://www.googleapis.com/auth/script.metrics
   ```

   Для сценариев «только чтение» замените первые два на read-only-варианты `script.projects.readonly` и `script.deployments.readonly`; инструментам `list_processes` и `get_project_metrics` по-прежнему нужны `script.processes` и `script.metrics` — более узких вариантов у них нет. `run_function` не требует ни одного из этих scope — вместо них токен должен нести все scope, которые использует сам целевой скрипт, а OAuth-клиент должен принадлежать **тому же проекту Cloud**, что и скрипт.

Refresh token OAuth-приложения в режиме Testing может истечь через семь дней. Для долгого доступа опубликуйте OAuth-приложение или используйте Internal-приложение в домене Workspace. Храните client secret и refresh token как пароли.

Инструмент `setup_instructions` возвращает этот же чек-лист и работает даже до настройки учётных данных.

## Конфигурация

| Переменная | Обязательна | Описание |
|---|---|---|
| `GOOGLE_APPS_SCRIPT_CLIENT_ID` | Да* | OAuth client ID. |
| `GOOGLE_APPS_SCRIPT_CLIENT_SECRET` | Да* | OAuth client secret. |
| `GOOGLE_APPS_SCRIPT_REFRESH_TOKEN` | Да* | OAuth refresh token. |
| `GOOGLE_APPS_SCRIPT_ACCESS_TOKEN` | Да* | Короткоживущая альтернатива OAuth-тройке. |
| `GOOGLE_APPS_SCRIPT_API_BASE` | Нет | Переопределяет базовый URL Google Apps Script API. |
| `GOOGLE_APPS_SCRIPT_TIMEOUT_MS` | Нет | Тайм-аут одного запроса; по умолчанию `60000` мс. |
| `GOOGLE_APPS_SCRIPT_MAX_RETRIES` | Нет | Повторы временных ошибок; по умолчанию `3`. |

\* Передайте OAuth-тройку или access token.

## Данные, лимиты и работа в фоне

- **Запросы идут в Google Apps Script.** Локальный сервер обновляет OAuth-токены Google и вызывает Apps Script API. Анонимная телеметрия содержит ID установки, версию пакета, версии AI-клиента и платформы и имена инструментов — но не OAuth-токены, исходники скриптов, аргументы или промпты. Чтобы отключить её, задайте `ASKADS_TELEMETRY=0`.
- **Запись никогда не повторяется вслепую.** При `429` сервер использует задержку; чтение также повторяется после сетевых и `5xx` ошибок, а запись после неопределённой ошибки не повторяется — задвоенный `create_version` плодит неизменяемые версии, а задвоенный `run_function` дважды выполняет побочные эффекты. После неясного сбоя проверьте `list_versions` или историю выполнений, а не отправляйте запрос заново.
- **Постоянного опроса нет.** Сервер работает только при вызове, а функция выполняется только по вашей просьбе. Собственные триггеры Apps Script остаются на стороне Google; если AI-приложение поддерживает задания по расписанию, оно также может периодически проверять историю выполнений.

## Техническая документация

- [Каталог MCP-возможностей](./docs/capabilities/index.md) — страницы по пользовательским задачам для каждого инструмента.
- [Все инструменты и параметры](./docs/TOOLS.md)
- [Документация по разработке](./docs/DEVELOPMENT.md)
- [Документация по публикации](./docs/PUBLISHING.md)
- [Справочник Google Apps Script API](https://developers.google.com/apps-script/api)

## Поддержка

Нашли ошибку или не хватает сценария? [Создайте issue](https://github.com/A1-x-Tech/mcp-google-apps-script/issues) или напишите в [Telegram](https://t.me/a1_mcp).

<br>

<p align="center">
  <img src="https://github.com/ztemerbekov/a1-yandex-kit-skills/raw/main/assets/images/mona-hifive-yandex-kit-warm.gif" alt="Две Моны дают пять" width="256">
</p>

<p align="center">
  Вы дочитали до конца!
</p>
