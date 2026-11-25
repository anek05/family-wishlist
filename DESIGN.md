# Regeringsbildning.nu – design och inventering

## Utgångsläge

Inventerat 2026-11-24. Projektet bestod av `index.html`, `CNAME`, `.gitattributes` och en kort README. HTML-filen innehöll sju duplicerade personkort, inline-JavaScript och Firebase SDK 11.0.0. Tailwind och daisyUI laddades från CDN. Referensen till `styles.css` pekade på en fil som saknades. Det fanns inga tester, inget byggsteg, ingen inloggning och ingen separat serverkod.

Användarflödena var att läsa alla listor, skriva en önskning med valfri länk, spara via knapp eller Enter och radera efter bekräftelse. Redigering saknades. Fel loggades bara i konsolen och gränssnittet uppdaterades innan sparandet bekräftats.

Firebase använder befintligt projekt `familj-wishlist`, sökvägen `wishlists/{namn}` och arrayer med objekt `{ title, url }`. De sju namnen är Linnéa, Sebastian, Mamma, Pappa, Elsa, Mormor och Andreas. Dessa identiteter och databasfält behålls. Ingen migration, årsrensning eller förändring av säkerhetsregler ingår.

## Visuell referens och källor

Källa: [Sveriges riksdags startsida](https://www.riksdagen.se/sv/), hämtad med Firecrawl 2026-11-24 och visuellt granskad i webbläsare vid cirka 1265 px bredd. Referensens startsida hade en vit sidhuvudsyta, tydliga navigationslänkar, en bred blå informationsyta om regeringsbildningen och avgränsade innehållsblock. Referensens logotyp, bilder och rikssymboler återanvänds inte.

Firecrawls branding-data rapporterade blått `#1C5070`, bakgrund `#FFFFFF`, text `#1B1B1B`, gul sekundärfärg `#DAB823` och Open Sans. Detta är extraherade värden, inte en fullständig eller manuellt verifierad CSS-inventering. Verktygets teckenstorlekar var inte tillförlitliga för hela sidan och har inte använts som exakta specifikationer. Spacing i referensen bedömdes visuellt. Referensens mobilbeteende har inte kopierats eller antagits utifrån desktopbilden.

## Egen identitet

En varm, lågmäld institution med devisen **För julfridens skull.** Kontrasten mellan parlamentariskt tilltal och familjens julklappar bär humorn. Huvudbudskapet är **En regering kan vänta. Julfriden kan det inte.** Inga verkliga partier, politiker, myndighetslogotyper eller påståenden om politiska händelser ingår.

Den egna symbolen är ett linjetecknat paket. `chamber.svg` är en egen vektorillustration med paket i halvcirkelform kring en liten julgran: ett visuellt julfridsutskott. Illustrationerna saknar externa bild- och fontberoenden. Dekorativa bilder har tom alt-text; informationen finns i vanlig text.

## Designtokens – egna val

Alla tokens finns i `:root` i `styles.css`.

| Roll            | Värde     | Användning                            |
| --------------- | --------- | ------------------------------------- |
| Institutionsblå | `#173f50` | Hero, primärknappar, rubriker         |
| Mörkblå         | `#102f3d` | Sidfot, hover                         |
| Dämpat guld     | `#e7c77d` | Huvudåtgärd, illustration, heroaccent |
| Varmvit         | `#f8f7f3` | Sidbakgrund                           |
| Vit             | `#ffffff` | Kort och formulärfält                 |
| Brödtext        | `#253c44` | Läsbar huvudtext                      |
| Sekundärtext    | `#56676c` | Hjälptext                             |
| Grangrön        | `#32624f` | Små rubriker, bekräftelser            |
| Röd             | `#a22e30` | Radera och fel                        |
| Avgränsare      | `#d6dedc` | Ramar och linjer                      |

Georgia används i stora rubriker och namn som ett eget redaktionellt val; systemtypsnitt används i brödtext och kontroller. Det skiljer identiteten från referensens Open Sans utan att kräva fontnedladdning. Normal brödtext är 16 px, formulärfält minst 16 px och primära kontroller minst 48 px höga. Kompletterande text är mindre. Kort har tunna ramar, 4 px radie och ingen dekorativ skugga. Maximal innehållsbredd är 1160 px.

## Struktur och navigation

1. Inofficiell institutionsrad och ett enkelt sidhuvud med två ankarlänkar.
2. Hero med tema och två tydliga genvägar till listorna.
3. Kort kanslimeddelande med torr humor.
4. Kravlistor med ett native namnval och gemensam översikt.
5. Tre enkla instruktioner och en upplysning om gemensam redigeringsåtkomst.
6. Diskret sidfot som uttryckligen beskriver en inofficiell familjeapp.

Alla listor visas från början. Namnval eller knappen på ett personkort öppnar en lista och dess formulär. Att välja namn är **inte inloggning**, och ingen sådan införs. Alla befintliga åtkomsträttigheter behålls. I den valda listan finns textknapparna **Redigera** och **Ta bort**. En native dialog bekräftar radering med **Behåll önskningen** som första fokus.

## Språk

| Sammanhang        | Benämning                                                          |
| ----------------- | ------------------------------------------------------------------ |
| Översiktsrubriker | Kravlistor, förhandlingspart, julfridsutskott                      |
| Viktiga åtgärder  | Lägg till önskning, Redigera, Spara ändringar, Ta bort             |
| Formulär          | Vad önskar du dig? Länk till julklappen (valfritt)                 |
| Bekräftelser      | Sparad först efter Firebase-svar, följt av en kort tematisk mening |
| Tom lista         | Inga önskningar ännu. Förhandlingsläget bedöms som stabilt.        |

Humorn får omge en handling, men ersätter inte dess begripliga namn.

## Mobil och tillgänglighet

Vid högst 680 px visas en kolumn och formuläret före den valda listan. Översikten har två kolumner på mellanstora skärmar och tre på stora. Sidhuvudet visar båda navigationslänkarna utan hamburgermeny. Tydliga fokusmarkeringar, riktiga labels, native select, native dialog, `role=status`, felfeedback och `prefers-reduced-motion` används. Innehåll kan brytas även vid långa ord och produktlänkar. Layouten provas vid 320, 375, 390, 430, 768 och 1280 px.

## Tekniska avgränsningar

Applikationen är fortsatt statisk HTML/CSS/JavaScript. Firebase SDK-version, projekt, databasmodell och namn är oförändrade. Tailwind/daisyUI ersätts av lokal CSS eftersom den lilla appen inte behöver dessa runtime-beroenden. JavaScript har flyttats till en läsbar separat modul. Utvecklingsberoenden används bara för webbläsartester och automatisk tillgänglighetskontroll.

Sparandet använder transaktioner på samma persons befintliga array. Nytillagda krav från andra klienter bevaras. Redigering och radering avbryts om det valda objektet har ändrats eller flyttats. Okända extra fält på ett redigerat objekt bevaras. Det sker ingen automatisk datakonvertering i databasen. Databasreglerna måste tillåta samma läs- och skrivåtkomst som tidigare; transaktioner kräver båda.

## Verifiering och begränsningar

Se README för testkommandon. Skärmbilder i `test-results/` använder enbart testdata, aldrig familjens verkliga listor. Automatisk axe-kontroll är stöd för tillgänglighetsarbetet, inte en fullständig WCAG-certifiering. Ingen fysisk iPhone eller skärmläsarsession har verifierats.

Vid lokal kontroll mot den oförändrade Firebase-konfigurationen 2026-11-24 nekades läsning med `Permission denied`. Orsaken kan inte fastställas från klientkoden. Riktiga listor och skarp skrivning har därför inte kunnat verifieras. Regler, App Check och eventuell annan befintlig Firebase-konfiguration behöver granskas av projektägaren inför publicering. De ändras inte i denna omarbetning. `CNAME` lämnas på den befintliga domänen tills publicering är uttryckligen godkänd.

Uppföljning samma dag: projektägaren delade de aktiva reglerna, som nekar all läsning och skrivning (`.read: false`, `.write: false`). Detta bekräftar orsaken. Ett ej publicerat, offentligt åtkomstförslag begränsat till `wishlists` och de sju personnamnen finns i `database.rules.example.json`; konsekvenser och instruktioner finns i README. Ingen ändring av Firebase har genomförts.
