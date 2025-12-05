# Hadynski - Call Recording QA System

System do transkrypcji i analizy quality assurance nagrań rozmów z Daktela przy użyciu ElevenLabs.

## Setup

### 1. Zainstaluj zależności
```bash
npm install
```

### 2. Skonfiguruj zmienne środowiskowe

Skopiuj `.env.example` do `.env.local` i uzupełnij wartości:

```bash
cp .env.example .env.local
```

Edytuj `.env.local`:
```env
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

### 3. Uruchom lokalny Convex backend

W osobnym terminalu:
```bash
npx convex dev --local
```

### 4. Uruchom Next.js dev server

```bash
npm run dev
```

Aplikacja będzie dostępna na `http://localhost:3000`

## Struktura bazy danych

### Tabele Convex:

- **departments** - działy z credentialsami Daktela
  - `daktelaUrl` - URL instancji Daktela
  - `daktelaApiKey` - klucz API Daktela
  - `systemPrompt` - opcjonalny system prompt dla LLM

- **calls** - nagrania rozmów
  - `callId` - ID rozmowy z Daktela
  - `departmentId` - odniesienie do działu
  - `recordingUrl` - URL nagrania
  - `createdAt` - timestamp

- **transcriptions** - transkrypcje nagrań
  - `callId` - odniesienie do rozmowy
  - `text` - treść transkrypcji
  - `qaAnalysis` - wyniki analizy QA (zdenormalizowane)
  - `createdAt` - timestamp

- **qaQuestions** - pytania QA per dział
  - `departmentId` - odniesienie do działu
  - `question` - treść pytania
  - `order` - kolejność wyświetlania
  - `active` - czy pytanie jest aktywne

## Workflow

### 1. Dodaj dział do bazy danych

Otwórz Convex Dashboard lub użyj mutation:

```typescript
await convex.mutation(api.departments.create, {
  daktelaUrl: "https://your-instance.daktela.com",
  daktelaApiKey: "your_api_key",
  systemPrompt: "You are a QA assistant analyzing call center conversations..."
});
```

### 2. Dodaj pytania QA dla działu

```typescript
await convex.mutation(api.qaQuestions.create, {
  departmentId: "...",
  question: "Czy agent powitał klienta?",
  order: 1,
  active: true
});
```

### 3. Użyj aplikacji

1. Wybierz dział z dropdown
2. Kliknij "Load Recordings" - załaduje listę nagrań z Daktela
3. Dla każdego nagrania:
   - **Transcribe** - pobiera audio i transkrybuje przez ElevenLabs
   - **QA** - wykonuje analizę QA transkrypcji (wymaga dodania integracji LLM)
   - **Results** - wyświetla wyniki analizy QA

## API Endpoints

### GET /api/daktela/recordings
Pobiera listę nagrań z Daktela

Query params:
- `departmentId` - ID działu

### POST /api/calls/transcribe
Transkrybuje nagranie

Body:
```json
{
  "callId": "123",
  "departmentId": "...",
  "recordingUrl": "/path/to/recording.wav"
}
```

### POST /api/qa/analyze
Wykonuje analizę QA transkrypcji

Body:
```json
{
  "transcriptionId": "...",
  "departmentId": "..."
}
```

## TODO

- [ ] Dodać integrację LLM (OpenAI/Claude) do analizy QA
- [ ] Dodać error handling i retry logic
- [ ] Dodać progress indicators dla długich procesów
- [ ] Dodać zarządzanie pytaniami QA przez UI
- [ ] Dodać filtrowanie i sortowanie nagrań
- [ ] Dodać eksport wyników do CSV/PDF

## Tech Stack

- **Frontend**: Next.js 16, React 19, TailwindCSS
- **Backend**: Next.js API Routes
- **Database**: Convex (local)
- **Transcription**: ElevenLabs Speech-to-Text
- **Call Center**: Daktela API
