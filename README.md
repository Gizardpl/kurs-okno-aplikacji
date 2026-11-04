# Okno aplikacji Claude Desktop: zrzuty i raport różnic

Ten projekt robi zdjęcia okna aplikacji Claude Desktop i sprawdza, co się w nim zmieniło od poprzedniego razu. Działa
w całości na wynajętym na chwilę Macu w GitHub Actions, bez konta i bez prawdziwych danych.

## Jak to działa

1. **Codziennie** krótkie zadanie pyta oficjalny adres instalatora producenta o numer najnowszej wersji. Pełny przebieg
   rusza tylko przy nowej wersji, gdy wzorzec ma ponad 14 dni albo po uruchomieniu ręcznym.
2. **Pełny przebieg** na czystym Macu pobiera instalator z oficjalnego adresu, sprawdza podpis producenta, włącza
   oficjalny tryb aplikacji bez konta (https://claude.com/docs/third-party/claude-desktop/overview.md) i przeklikuje stałą
   trasę (`trasa/trasa.json`). Zamiast modelu odpowiada mały lokalny program (`bramka/`) zawsze tymi samymi, zmyślonymi
   wiadomościami. Przebieg udaje się tylko wtedy, gdy powstały zdjęcia wszystkich stanów okna z trasy.
3. **Kontrola prywatności przed wgraniem**: tekst ze zdjęć (OCR) jest przeszukiwany pod kątem adresów e-mail. Trafienie
   oznacza, że nic nie zostaje wgrane.
4. **Porównanie** z poprzednim wzorcem: raport mówi, w którym stanie okna i w którym miejscu coś się zmieniło, albo
   „0 różnic”.

## Co zostaje po przebiegu

| Artefakt | Zawartość | Jak długo |
|---|---|---|
| `zrzuty` | zdjęcia stanów okna; wzorzec dla kolejnego przebiegu | 30 dni |
| `raport` | różnice względem wzorca (JSON, opis, obrazy przed, po i różnica), wynik OCR | 14 dni |
| `diagnostyka`, `nagranie` | tylko po ręcznym uruchomieniu z opcją `diagnostyka`: wybrane logi aplikacji, drzewo elementów okna, dziennik atrapy, nagranie ekranu | 3 dni |

## Bezpieczeństwo

- Bez sekretów, konta i prawdziwych danych; atrapa modelu działa tylko na `127.0.0.1` jednorazowej maszyny.
- Uprawnienia: na górze `contents: read`. Jedyny zapis do repo robi zadanie `podtrzymanie` (data w
  `ostatnie-sprawdzenie.txt` po 45 dniach bez commita, bo GitHub wyłącza harmonogram po 60 dniach bez aktywności).
- Akcje przypięte do pełnego SHA, zależności w `package-lock.json`, limit czasu każdego zadania.
- Do repo nie trafia instalator ani pliki aplikacji. Gdy oficjalny adres nie odpowiada przekierowaniem (np. wymaga
  przeglądarki), przebieg kończy się błędem.
