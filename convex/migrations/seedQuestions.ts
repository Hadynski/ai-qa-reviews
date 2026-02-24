import { internalMutation } from "../_generated/server";

const SYSTEM_PROMPT_FIRST_CONTACT = `Jestes rygorystycznym analitykiem QA w firmie Hadynski Inkaso. Oceniasz transkrypcje rozmow zgodnie ze scislym protokolem.

TWOJE ZADANIE:
Ocen zgodnosc rozmowy z procedura, odpowiadajac na zadane pytanie wylacznie na podstawie transkrypcji.

INSTRUKCJA MYSLENIA (CHAIN OF THOUGHT):
Zanim udzielisz odpowiedzi, musisz przeprowadzic wewnetrzny proces analityczny w sekcji <thinking_process>.
Ten proces musi zawierac:
1. CYTATY: Wypisz wszystkie fragmenty transkrypcji, ktore moga dotyczyc pytania.
2. ANALIZE LOGICZNA:
   - Jesli pytanie wymaga liczenia (np. "min. 2 obiekcje"): Wypunktuj je i policz (1... 2...).
   - Jesli pytanie ma warunki wykluczajace (np. "pytanie o cene to nie obiekcja"): Odsiej falszywe tropy.
   - Jesli pytanie dotyczy sekwencji (np. "wszystko na raz"): Sprawdz ciaglosc wypowiedzi.
3. WERDYKT: Dopasuj wynik analizy do dostepnych opcji odpowiedzi.

FORMAT ODPOWIEDZI:
Twoja odpowiedz koncowa musi byc w formacie JSON (lub ustrukturyzowanym tekscie, jesli wolisz), zawierajacym:
- "thought_process": (krotkie podsumowanie twojej analizy),
- "answer": (DOKLADNE brzmienie jednej z opcji z listy),
- "justification": (jedno zdanie z cytatem i uzasadnieniem).

ZASADY KRYTYCZNE:
- Nie zgaduj intencji - oceniaj fakty (slowa).
- Badz "surowym audytorem" - jesli element jest niepelny, traktuj go jako brak.
- Odpowiadaj wylacznie wybierajac jedna z podanych <possible_answers>.`;

const SYSTEM_PROMPT_ANALYSIS = `Jestes rygorystycznym analitykiem QA w firmie Hadynski Inkaso. Oceniasz transkrypcje rozmow z etapu analizy dluznika zgodnie ze scislym protokolem.

TWOJE ZADANIE:
Ocen zgodnosc rozmowy z procedura analityczna, odpowiadajac na zadane pytanie wylacznie na podstawie transkrypcji.

INSTRUKCJA MYSLENIA (CHAIN OF THOUGHT):
Zanim udzielisz odpowiedzi, musisz przeprowadzic wewnetrzny proces analityczny w sekcji <thinking_process>.
Ten proces musi zawierac:
1. CYTATY: Wypisz wszystkie fragmenty transkrypcji, ktore moga dotyczyc pytania.
2. ANALIZE LOGICZNA:
   - Jesli pytanie wymaga liczenia: Wypunktuj i policz.
   - Jesli pytanie ma warunki wykluczajace: Odsiej falszywe tropy.
   - Jesli pytanie dotyczy sekwencji: Sprawdz ciaglosc.
3. WERDYKT: Dopasuj wynik analizy do dostepnych opcji odpowiedzi.

FORMAT ODPOWIEDZI:
- "thought_process": (krotkie podsumowanie twojej analizy),
- "answer": (DOKLADNE brzmienie jednej z opcji z listy),
- "justification": (jedno zdanie z cytatem i uzasadnieniem).

ZASADY KRYTYCZNE:
- Nie zgaduj intencji - oceniaj fakty (slowa).
- Badz "surowym audytorem" - jesli element jest niepelny, traktuj go jako brak.
- Odpowiadaj wylacznie wybierajac jedna z podanych <possible_answers>.`;

interface SeedQuestion {
  id: string;
  question: string;
  context: string;
  reference_script?: string;
  goodExamples?: string[];
  badExamples?: string[];
  possibleAnswers: string[];
}

const FIRST_CONTACT_QUESTIONS: SeedQuestion[] = [
  {
    id: "wstep__przedstawienie_sie_i_intencja_kontaktu_w_calosci_na",
    question: "Czy agent przedstawil sie, podal nazwe firmy, wyjasnil cel rozmowy i potwierdzil, ze klient zostawil kontakt? (wszystko musi byc powiedziane na raz)",
    context: "Sprawdz wstep rozmowy. Wymagane WSZYSTKIE elementy PRZED pierwszym pytaniem o sprawe ('co sie wydarzylo', 'prosze powiedziec co sie stalo', 'jaka jest sytuacja'): (1) PRZEDSTAWIENIE SIE - imie agenta (forma dowolna: 'nazywam sie...', 'z tej strony...', 'mowi...'). (2) NAZWA FIRMY - jednoznaczna nazwa (Hadynski/Chudynski/Inkaso). Zaimki 'u nas', 'nasza firma' = NIE WYSTARCZY. (3) CEL ROZMOWY - jasne odniesienie do dluznika (zgloszenie/formularz/dluznik). (4) POTWIERDZENIE INTENCJI KONTAKTU - agent stwierdza ze KLIENT wczesniej kontaktowal sie z firma (formularz, zgloszenie, prosba o kontakt) i ze dotyczy to dluznika. (5) POTWIERDZENIE POPRAWNOSCI - spelnione gdy: WARIANT A: Agent zada pytanie potwierdzajace ('zgadza sie?', 'to sie zgadza?', 'dobrze?', 'tak?') LUB WARIANT B: Klient SAMODZIELNIE potwierdzi poprawnosc ('tak, zgadza sie', 'tak, dokladnie') ZANIM agent zdazy zapytac. MOMENT GRANICZNY: Jesli JAKIKOLWIEK wymagany element pojawi sie PO pierwszym pytaniu o sprawe = NIE. WYJATEK: Przy rozmowie kontynuowanej ('witam ponownie', 'oddzwaniam') - wymagane minimum: firma + cel.",
    reference_script: "Dzien dobry, IMIE AGENTA, firma Hadynski Inkaso, zostawil Pan przez formularz kontaktowy na naszej stronie prosbe o kontakt w sprawie dluznika. Zgadza sie?",
    goodExamples: [
      "Dzien dobry, [IMIE] z tej strony, firma Hadynski Inkaso. Kontaktuje sie w sprawie zgloszenia, ktore Pan/Pani zostawil/a. Chodzi o dluznika, zgadza sie?",
      "Dzien dobry, [IMIE], firma Hadynski Inkaso. Wypelnil Pan formularz na naszej stronie z prosba o kontakt w sprawie dluznika, to sie zgadza?",
    ],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_pytanie_o_imie_i_intencja_tego_po_co_nam",
    question: "Czy agent zapytal o imie klienta oraz poinformowal, dlaczego pyta o imie (np. zeby rozmowa przebiegala sprawniej, byla przyjemniejsza, latwiej bylo sie komunikowac itp.)?",
    context: "SCIEZKA A - PYTANIE O IMIE + INTENCJA: Agent zadaje pytanie o imie ORAZ wyjasnia dlaczego pyta. SCIEZKA B - ZWRACANIE SIE PO IMIENIU (AUTOMATYCZNIE TAK): Jezeli agent uzywa JAKIEJKOLWIEK formy imienia klienta podczas rozmowy = odpowiedz TAK. Przyklady SCIEZKI B: 'Pani Aniu', 'Panie Marcinie', 'Panie Tomku', 'Pani Anno', 'Panie Jan' - kazde takie uzycie = TAK. WAZNE: Nawet JEDNO uzycie imienia klienta przez agenta oznacza TAK. Odpowiedzi: 'Tak' - Sciezka A (pytanie+intencja) LUB Sciezka B (jakiekolwiek uzycie imienia klienta). 'Nie' - TYLKO gdy agent NIGDY nie uzyl imienia klienta przez cala rozmowe.",
    goodExamples: [
      "A jak moge sie do Pana zwracac, zeby nam sie lepiej rozmawialo?",
      "Moge prosic o imie, zebym mogla sie do Pana zwracac?",
    ],
    badExamples: [
      "Z kim mam przyjemnosc? (bez intencji - SCIEZKA A niespelniona)",
      "Agent nie pyta o imie i nie zwraca sie po imieniu przez rozmowe",
    ],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_weryfikacja_z_jakim_typem_klienta_mamy_stycznosc",
    question: "Czy agent zweryfikowal, z jakim typem klienta ma stycznosc (gadula czy zamkniety)?",
    context: "Ocen czy agent ZWERYFIKOWAL typ klienta i DOSTOSOWAL zachowanie. OCENA WYMAGA DWOCH ELEMENTOW: 1. IDENTYFIKACJA typu klienta (gadula vs zamkniety). 2. REAKCJA adekwatna do typu. DLA GADULY: Agent SLUCHA (potakuje: 'mhm', 'rozumiem', 'okej'), NIE PRZERYWA, NAWIAZUJE do wypowiedzi klienta. DLA ZAMKNIETEGO: Agent zadaje pytania OTWARTE PRZED pytaniami o kwote/czas ('Prosze opowiedziec wiecej', 'Co tam sie wydarzylo?'). Odpowiedz 'Tak' tylko jesli agent DOSTOSOWAL zachowanie do typu klienta.",
    goodExamples: [
      "Czy moglby Pan powiedziec cos wiecej o sprawie?",
      "Co sie wydarzylo?",
    ],
    badExamples: [
      "Agent od razu zadaje pytanie o kwote/termin bez pytania pogliebiajacego przy zamknietym kliencie",
    ],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_intencja_do_pytan",
    question: "Czy agent przedstawil intencje do pytan otwartych oraz zadal pytania otwarte?",
    context: "Sprawdz, czy agent WYRAZNIE uzasadnil potrzebe zadawania pytan. Wymagana formula 'CEL -> PYTANIA': 'Zeby dobrac rozwiazanie, musze zadac kilka pytan.', 'Aby ocenic sytuacje, dopytam o szczegoly.', 'Zanim przejde dalej, musze wiedziec...'. WAZNE: Intencja moze pasc na samym poczatku rozmowy lub bezposrednio przed wywiadem. Musi zawierac element 'po co to robie' (korzysc/proces).",
    reference_script: "Zeby dobrac najlepsze rozwiazanie dla Pana/Pani, potrzebuje zadac jeszcze kilka pytan typowo o sprawie, dobrze?",
    goodExamples: [
      "Zeby dobrac dla Pana najlepsze rozwiazanie, potrzebuje zadac jeszcze kilka pytan typowo o sprawie, dobrze?",
    ],
    badExamples: [
      "Prosze mi opowiedziec, co sie stalo. (To tylko pytanie otwierajace)",
    ],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_czy_pozyskano_informacje_o_kwocie",
    question: "Czy agent pozyskal informacje o kwocie zadluzenia podczas rozmowy?",
    context: "Sprawdz, czy w rozmowie padla informacja o kwocie zadluzenia. Odpowiedz 'Tak' w dwoch przypadkach: 1. AKTYWNIE: Agent zapytal o kwote lub sparafrazowal ja. 2. PASYWNIE: Klient sam wyraznie podal kwote i agent to uslyszal. Odpowiedz 'Nie' tylko wtedy, gdy kwota w ogole nie padla w rozmowie.",
    goodExamples: ["O jakiej kwocie mowimy?", "Ile tam zostalo do zaplaty?"],
    possibleAnswers: ["Tak", "Nie", "Nie dotyczy - klient nie pamieta"],
  },
  {
    id: "ds_czy_pozyskano_jaki_czas_zalega",
    question: "Czy agent pozyskal informacje o tym, jaki czas dluznik zalega klientowi dlug?",
    context: "Sprawdz, czy ustalono, od jakiego czasu wystepuje zadluzenie. Odpowiedz 'Tak' jesli: 1. Agent zapytal o czas zalegania. 2. Agent sparafrazowal czas podany przez klienta. 3. Klient sam spontanicznie podal te informacje.",
    goodExamples: ["Kiedy uplynal termin platnosci?", "Od kiedy nie placa?"],
    possibleAnswers: ["Tak", "Nie", "Nie dotyczy - klient nie pamieta"],
  },
  {
    id: "ds_czy_to_pierwsza_taka_sytuacja",
    question: "Czy agent zapytal klienta, czy to pierwsza taka sytuacja z tym dluznikiem, ze nie placi?",
    context: "Sprawdz czy agent AKTYWNIE pozyskal informacje o HISTORII WSPOLPRACY/PLATNOSCI z dluznikiem. Wymagane pytanie o przeszlosc relacji z dluznikiem lub parafraza historii podanej przez klienta.",
    goodExamples: [
      "To byla pierwsza taka sytuacja?",
      "Jak wczesniej wygliadala wspolpraca?",
    ],
    badExamples: [
      "Czy planuje Pan dalsza wspolprace? (to pytanie o przyszlosc, nie historie)",
    ],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_czy_pozyskano_informacje_o_wymowkach",
    question: "Czy agent pozyskal informacje o wymowkach dluznika?",
    context: "Celem jest ustalenie reakcji dluznika na windykacje. Odpowiedz 'Tak', jesli w rozmowie pojawia sie informacja o konkretnych wymowkach lub braku kontaktu/unikaniu kontaktu.",
    goodExamples: ["Jakies wymowki stosuja?", "Jak sie tlumacza?"],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds__czy_pozyskano_informacje_o_krokach_prawnych_podjetych_przez_klienta",
    question: "Czy agent pozyskal informacje o krokach prawnych podjetych przez klienta w sprawie dluznika?",
    context: "Sprawdz, czy AGENT AKTYWNIE zapytal o kroki PRAWNE/FORMALNE. Odpowiedz 'Tak' TYLKO jesli agent zadal pytanie SPECYFICZNIE o dzialania prawne/formalne.",
    goodExamples: [
      "Czy podejmowal Pan jakies kroki prawne w tej sprawie?",
      "Jakies kroki Pan podjal w tej sprawie?",
    ],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds__czy_pozyskano_informacje_o_tym_co_klient_do_tej_pory_zrobil_w_sprawie",
    question: "Czy agent pozyskal informacje o tym co klient do tej pory zrobil w sprawie?",
    context: "Sprawdz, czy AGENT AKTYWNIE zapytal o dotychczasowe dzialania klienta. FILOZOFIA: PROCES > WYNIK. Liczy sie czy agent ZAPYTAL, nie czy informacja padla w rozmowie.",
    goodExamples: [
      "Co Pan do tej pory zrobil w tej sprawie?",
      "Jakies kroki Pan juz podejmowal na wlasna reke?",
    ],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_pobranie_danych_i_intencja_do_pobrania",
    question: "Czy agent zapytal o dane korespondencyjne dluznika (adres, telefon, NIP) z podaniem intencji I faktycznie je uzyskal?",
    context: "Czy agent dazyl do precyzyjnej identyfikacji dluznika? Odpowiedz 'Tak' jesli agent poprosil o NIP/dane z intencja sprawdzenia/weryfikacji LUB sam odnalazl dluznika w systemie i potwierdzil z klientem.",
    goodExamples: [
      "Czy ma Pan NIP tego dluznika? Zebym mogl sprawdzic w systemie.",
      "Poprosze o dane dluznika, zebym mogl sprawdzic w systemie.",
    ],
    possibleAnswers: ["Tak", "Nie", "Nie dotyczy - klient nie ma przy sobie danych"],
  },
  {
    id: "ds_pytanie_o_dalsza_wspolprace_z_dluznikiem_i_modulowanie",
    question: "Czy agent zadal wprost pytanie, czy klientowi zalezy na utrzymaniu dobrej relacji z dluznikiem lub dalszej wspolpracy?",
    context: "Czy ustalono nastawienie klienta do dalszej wspolpracy z dluznikiem?",
    goodExamples: [
      "Czy planuje Pan dalsza wspolprace z tym dluznikiem?",
      "Zalezy Panu na utrzymaniu relacji z ta firma?",
    ],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_zaskoczenie_tym_ze_mamy_dluznika_w_systemie__2_pytania",
    question: "Czy agent zareagowal na informacje o dluzniku w systemie zgodnie ze skryptem (stwierdzenie + 2 pytania)?",
    context: "Sprawdz reakcje na dluznika w systemie. Wymagane stwierdzenie o obecnosci w bazie ORAZ pytanie weryfikujace.",
    reference_script: "Wie Pan co... [stwierdzenie o dluzniku w systemie]. Pan trafil do nas z jakiegos polecenia? Wiedzial Pan o tym, ze juz go windykowalismy?",
    goodExamples: [
      "Wie Pan co, mamy tego dluznika w systemie...",
      "Pan trafil do nas z jakiegos polecenia?",
    ],
    possibleAnswers: ["Tak", "Nie", "Nie dotyczy - klient nie ma przy sobie danych/klient z polecenia,aktualny klient"],
  },
  {
    id: "ds_nadanie_wartosci_przeprowadzanej_analizie__ograniczenie",
    question: "Czy agent jasno przedstawil klientowi wartosc wstepnej analizy sprawy?",
    context: "Sprawdz czy agent nadal WARTOSC analizie. Odpowiedz 'Tak' TYLKO jesli agent przekazal CO NAJMNIEJ 2 z 3 elementow: 1. MOZLIWOSC NIEPRZYJECIA. 2. POWOD ANALIZY. 3. KORZYSC DLA KLIENTA.",
    reference_script: "Panie [IMIE KLIENTA], powiem Panu wprost, moze byc tak, ze nie bede w stanie przyjac Pana sprawy...",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_przedstawienie_dalszych_krokow_analizy_i_modulowanie",
    question: "Czy agent jasno przedstawil klientowi dalsze kroki analizy, podkreslajac indywidualne podejscie?",
    context: "Sprawdz czy agent JASNO przedstawil dalsze kroki analizy. Odpowiedz 'Tak' TYLKO jesli agent podal MINIMUM 2 z 3 elementow: 1. KTO/JAK. 2. INTENCJA (PO CO). 3. KIEDY - KONKRETNY termin.",
    reference_script: "Ja tutaj widze, ze na godzine [GODZINA] moge zarezerwowac dzial prawny i wraz z nim przeanalizujemy sytuacje dluznika, zeby dobrac dla Pana najskuteczniejsze rozwiazanie, czy mozemy umowic sie na telefon o godzinie [PODAJ GODZINE]?",
    badExamples: [
      "Sprawdze to (bez wyjasnienia co, jak, kiedy)",
      "Dam znac (bez zadnych szczegolow)",
    ],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_informacja_o_bezplatnej",
    question: "Czy agent przekazal klientowi informacje o tym, ze analiza jego dluznika jest bezplatna?",
    context: "Czy agent poinformowal, ze ten etap (analiza/weryfikacja) jest darmowy? Szukaj slow: 'bezplatna', 'darmowa', 'bez kosztow', 'nic Pan nie placi', 'na nasz koszt'.",
    reference_script: "Oczywiscie taka analiza bedzie dla Pana calkowicie bezplatna.",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_zwracanie_sie_do_klienta_po",
    question: "Czy agent zwracal sie do klienta po imieniu?",
    context: "Sprawdz, czy agent uzyl imienia klienta (w wolaczu lub mianowniku) w trakcie calej rozmowy. Uzycie min. 2 razy -> TAK. Uzycie 0-1 razy -> NIE.",
    goodExamples: ["Panie Janie...", "Dobrze, Panie Tomaszu..."],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_pauzy_w_rozmowie",
    question: "Czy rozmowa brzmi naturalnie, tzn. czy agent robi krotkie pauzy/zastanowienia zamiast czytac skrypt jednym ciagiem?",
    context: "Ocen, czy rozmowa brzmi NATURALNIE. Odpowiedz 'Tak' TYLKO jesli wystepuja MINIMUM 3 elementy naturalnosci: wtrącenia, reakcje na emocje, pytania pogliebiajace, dostosowanie tempa, spontaniczne komentarze.",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_brak_informacji_o_warunkach_wspolpracy_cenasankcjenota",
    question: "Czy przekazano klientowi informacje o warunkach wspolpracy: Cena/sankcje/nota",
    context: "WAZNE: Informacja o 'bezplatnej analizie' NIE jest informacja o warunkach wspolpracy. Warunki wspolpracy to: konkretna cena uslugi windykacyjnej, procent prowizji, sankcje, nota.",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_umowienie_sie_na_rozmowe_z_analiza_dluznika",
    question: "Czy agent umowil sie z klientem na konkretna godzine rozmowy z analiza dluznika oraz poinformowal, ze w analize bedzie zaangazowany dzial prawny lub windykatorzy?",
    context: "Sprawdz czy agent umowil konkretny termin z analiza. Wymagane WSZYSTKIE elementy: 1. REZERWACJA ZASOBU. 2. CO ZROBIMY. 3. INTENCJA. 4. KONKRETNA GODZINA.",
    badExamples: [
      "Zadzwonie do pana (bez podania kiedy)",
      "Odezwe sie jak bede mial wiecej informacji",
    ],
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_zbijanie_obiekcji__minimum_dw",
    question: "Czy agent zbijar obiekcje klienta na temat uslugi/rozwiazania minimum dwukrotnie?",
    context: "ALGORYTM OCENY: KROK 1 - IDENTYFIKACJA OBIEKCJI: Obiekcja to WYRAZNY OPOR klienta wobec USLUGI WINDYKACYJNEJ lub PROPOZYCJI AGENTA. KROK 2 - LICZENIE ZBIC: 0-1 zbic = 'Nie'. 2+ zbic = 'Tak'. DOMYSLNIE jesli rozmowa przebiegla plynnie = 'Nie dotyczy - brak obiekcji'.",
    possibleAnswers: ["Tak", "Nie", "Nie dotyczy - brak obiekcji"],
  },
  {
    id: "ds_budowanie_relacji",
    question: "Czy agent budowal relacje z klientem, zadajac dodatkowe pytania i okazujac zainteresowanie sytuacja klienta?",
    context: "Ocen, czy agent budowal relacje poprzez ROZWINIETA wymiane zdan (storytelling). Wymagane do 'Tak': Agent dzieli sie WLASNA, KONKRETNA historia w minimum 2-3 zdaniach.",
    possibleAnswers: ["Tak", "Nie"],
  },
];

const ANALYSIS_QUESTIONS: SeedQuestion[] = [
  {
    id: "ds_zorientowanie_sie_czy_klient_ma_czas_na_analize",
    question: "Zorientowanie sie, czy klient ma czas na analize",
    context: "",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_dobra_i_zla_informacja",
    question: "Czy agent powiedzial, ze ma dla klienta dobra i zla wiadomosc o sprawie?",
    context: "Tak - \"Mam dla Pana dobra i zla informacje...\"\nNie - \"Mam dla Pana dwie informacje, dobra jest taka ... zla jest taka...\", albo brak",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_przyklady_naszej_stycznosci_z_dluznikiem",
    question: "Czy agent podal informacje o tym, kiedy toczylo sie ostatnie postepowanie windykacyjne, czy odzyskalismy dlug oraz na jaka kwote z dluznikiem i w jakim czasie to odzyskalismy?",
    context: "Tak - kwota, kiedy i w jakim czasie odzyskalismy",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_intencja_do_obrazowania_sankcji",
    question: "Intencja do obrazowania sankcji",
    context: "Tak - informacja PO CO klientowi mowimy o narzedziach",
    reference_script: "Panie IMIE klienta, mamy duzo roznych, skutecznych narzedzi, natomiast opowiem Panu o dwoch, na ktorych mi najbardziej zalezy, w strategii w Pana sprawie, poniewaz te dwie sankcje ostatnim razem przyniosly najlepsze rezultaty.",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_analiza_potrzeb__czy_klient_w",
    question: "Czy agent sprawdzil, czy klient wspolpracowal juz wczesniej z windykacja oraz czy klient wie, na czym ona polega?",
    context: "",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_analiza_dluznika__definicja_w",
    question: "Definicja windykacji",
    context: "Zgodnie ze skryptem lub zachowujac wierny sens",
    reference_script: "Windykacja to takie dzialania, ktore maja na celu sprawic, ze dlug Panskiego dluznika stanie sie dla niego tak niewygodny, ze bardziej oplaca mu sie oddac pieniadze niz dalej unikac splaty.",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_analiza_dluznika__obrazowanie",
    question: "Analiza dluznika - obrazowanie min. 2 narzedzi",
    context: "Tak - obrazowanie 2 sankcji (nie skryptowo, ale zachowujac sens obrazowania)\nCzesciowo - obrazowanie jednej sankcji, druga opisowo\nNie - brak lub sam opis sankcji bez obrazowania",
    possibleAnswers: ["Tak", "Czesciowo", "Nie", "Nie dotyczy - klient 2x odmowil ich wysluchania"],
  },
  {
    id: "ds_modulowanie_glosem_przy_sankcjach",
    question: "Modulowanie glosem przy sankcjach",
    context: "Subiektywne",
    possibleAnswers: ["Tak", "Czesciowo", "Nie", "Nie dotyczy - brak opisu sankcji"],
  },
  {
    id: "ds_skrotowe_przedstawienie_pozostalych_sankcji",
    question: "Skrotowe przedstawienie pozostalych sankcji",
    context: "Zalezne od potrzeb, kontekstu rozmowy i klienta - subiektywnie",
    possibleAnswers: ["Tak", "Czesciowo", "Nie", "Nie dotyczy - klient 2x odmowil ich wysluchania"],
  },
  {
    id: "ds_proba_zamkniecia_sprzedazy_po_obrazowaniu",
    question: "Czy agent probowal zadac pytanie o to czy dzialamy, jesli klient na pytanie o to co o tym mysli, nie mial zadnych pytan ani obiekcji.",
    context: "Tak/Nie - wtedy i tylko wtedy, gdy klient nie wyszedl po przedstawieniu narzedzi z jakimkolwiek innym watkiem mogacym zaburzyc schemat rozmowy.",
    possibleAnswers: ["Tak", "Nie", "Nie dotyczy"],
  },
  {
    id: "ds_ofertowanie__prawidlowe_i_kom",
    question: "Ofertowanie - prawidlowe i kompleksowe przedstawienie warunkow",
    context: "Zgodnie ze skryptem lub zachowujac wierny sens",
    reference_script: "I teraz tak, rozliczamy sie za sukces. Pobieramy X% od realnie odzyskanej kwoty...",
    possibleAnswers: ["Tak", "Czesciowo", "Nie"],
  },
  {
    id: "ds_zamkniecie_sprzedazy__deklara",
    question: "Czy agent podjal probe zamkniecia sprzedazy, Czy wystapila deklaracja dzialania?",
    context: "Tak - gdy zada sie klientowi pytanie o dzialanie w sposob pewny, lub gdy on sam powie \"dzialamy\"",
    possibleAnswers: ["Tak", "Czesciowo", "Nie", "Nie dotyczy - klient ma obiekcje, ktorych nie udalo sie zbic"],
  },
  {
    id: "ds_zamkniecie_sprzedazy__konkret",
    question: "Czy agent ograniczyl sie do konkretnego terminu podpisania umowy?",
    context: "Dotyczy stricte daty podpisania umowy",
    possibleAnswers: ["Tak", "Czesciowo", "Nie", "Nie dotyczy - brak decyzji"],
  },
  {
    id: "ds_ograniczenie__walka_o_ten_ter",
    question: "Czy agent podjal probe walki o krotszy termin niz proponowany przez klienta?",
    context: "Nie dotyczy - Jesli klient zaakceptowal nasza propozycje",
    possibleAnswers: ["Tak", "Nie", "Nie dotyczy"],
  },
  {
    id: "ds_info_o_dobrze_podjetej_decyzj",
    question: "Czy agent przekazal klientowi informacje o dobrej decyzji i czemu jest ona dobra?",
    context: "Tak - informacja o dobrej decyzji i czemu jest ona dobra",
    possibleAnswers: ["Tak", "Czesciowo", "Nie", "Nie dotyczy - brak decyzji"],
  },
  {
    id: "ds_podsumowanie_wszystkich_ustal",
    question: "Czy agent podsumowal wszystkie ustalenia z klientem?",
    context: "Tak - zgodnie z tym co wynika z rozmowy skryptowej",
    possibleAnswers: ["Tak", "Czesciowo", "Nie"],
  },
  {
    id: "ds_zlamanie_schematu_rozmowy",
    question: "Czy agent zlamal schemat rozmowy?",
    context: "Tak - brak jakiegokolwiek elementu skryptu powyzej lub brak zbijania obiekcji",
    possibleAnswers: ["Tak", "Nie"],
  },
  {
    id: "ds_przerywanie_klientowi",
    question: "Czy agent przerywal klientowi? Czy wtracal sie w slowo?",
    context: "Subiektywne",
    possibleAnswers: ["Tak", "Czesciowo", "Nie"],
  },
  {
    id: "ds_pauzy_w_rozmowie_analiza",
    question: "Czy w rozmowie wystepuja krotkie pauzy?",
    context: "Subiektywna ocena",
    possibleAnswers: ["Tak", "Czesciowo", "Nie"],
  },
  {
    id: "ds_zywe_zainteresowanie_klientem",
    question: "Zywe zainteresowanie klientem i budowanie relacji",
    context: "Tak - wyjscie ponad skrypt, dopytywanie, reagowanie, nawiazywanie do slow klienta",
    possibleAnswers: ["Tak", "Czesciowo", "Nie"],
  },
  {
    id: "ds_wysoki_poziom_energii_i_modul",
    question: "Wysoki poziom energii i modulowanie tonem glosu",
    context: "Subiektywne",
    possibleAnswers: ["Tak", "Czesciowo", "Nie"],
  },
  {
    id: "ds_zbijanie_obiekcji__minimum_dw_analiza",
    question: "Zbijanie obiekcji - minimum dwukrotna proba zbicia tej samej obiekcji",
    context: "Tak - zbita obiekcja\nCzesciowo - pomimo 2 prob/argumentow niezbita obiekcja\nNie - brak podjecia proby zbijania obiekcji",
    possibleAnswers: ["Tak", "Czesciowo", "Nie", "Nie dotyczy - brak obiekcji"],
  },
];

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingGroups = await ctx.db.query("questionGroups").collect();
    if (existingGroups.length > 0) {
      console.log("Question groups already exist, skipping seed");
      return { seeded: false };
    }

    const now = Date.now();

    const firstContactGroupId = await ctx.db.insert("questionGroups", {
      name: "first_contact",
      displayName: "First Contact",
      systemPrompt: SYSTEM_PROMPT_FIRST_CONTACT,
      isActive: true,
      statusIds: [],
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 0; i < FIRST_CONTACT_QUESTIONS.length; i++) {
      const q = FIRST_CONTACT_QUESTIONS[i];
      await ctx.db.insert("questions", {
        groupId: firstContactGroupId,
        questionId: q.id,
        question: q.question,
        context: q.context,
        referenceScript: q.reference_script,
        goodExamples: q.goodExamples,
        badExamples: q.badExamples,
        possibleAnswers: q.possibleAnswers,
        sortOrder: i,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const analysisGroupId = await ctx.db.insert("questionGroups", {
      name: "analysis",
      displayName: "Analysis Call",
      systemPrompt: SYSTEM_PROMPT_ANALYSIS,
      isActive: true,
      statusIds: [],
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 0; i < ANALYSIS_QUESTIONS.length; i++) {
      const q = ANALYSIS_QUESTIONS[i];
      await ctx.db.insert("questions", {
        groupId: analysisGroupId,
        questionId: q.id,
        question: q.question,
        context: q.context,
        referenceScript: q.reference_script,
        goodExamples: q.goodExamples,
        badExamples: q.badExamples,
        possibleAnswers: q.possibleAnswers,
        sortOrder: i,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log(
      `Seeded ${FIRST_CONTACT_QUESTIONS.length} first contact questions and ${ANALYSIS_QUESTIONS.length} analysis questions`
    );

    return {
      seeded: true,
      firstContactGroupId,
      analysisGroupId,
      firstContactQuestions: FIRST_CONTACT_QUESTIONS.length,
      analysisQuestions: ANALYSIS_QUESTIONS.length,
    };
  },
});
