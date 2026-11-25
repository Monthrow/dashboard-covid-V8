<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Keep the shared DataProvider and dashboard Shell in the `_authenticated/dashboard` layout so all dashboard pages share one loaded dataset and filters, and re-entering the dashboard picks up the latest ETL load.
- All pages except `/auth` live under the `_authenticated` layout, which asks a server function whether the encrypted admin cookie is set.
- Admin login compares the ADMIN_USERNAME/ADMIN_PASSWORD secrets in a server function (timing-safe) and stores the login in an encrypted `useSession` cookie keyed by SESSION_SECRET, so the password never reaches the browser.
- The admin cookie is SameSite=None; Secure so login works inside the embedded editor preview; CSRF middleware in src/start.ts guards server functions.
- Data lives in a local MySQL (XAMPP) reached only through the PHP Native API in `api/` (PDO, prepared statements, JSON); the browser calls it via `src/lib/api-client.ts`, because the user runs the stack locally and forbids cloud databases.
- `api/config/columns.json` is the single column definition (Excel order, types, categories) read by both PHP and `src/lib/covid-schema.ts`; change columns there and in `database/db_covid_indonesia.sql` together.
- Validation/normalisation rules exist twice (`src/lib/record-validation.ts`, `api/lib/validator.php`) and must stay identical; the backend always re-validates.
- ETL Load merges into the single active dataset in chunks tagged with a load_id; rows already stored (same date|location|city row_key) are skipped, never overwritten, and a failed load deletes its rows.
- Parse Excel in a browser worker and aggregate through the pure covid-data module so workbook processing stays off the UI thread and data rules remain testable.
- Keep images and the province boundary GeoJSON as real files in src/assets imported through Vite (GeoJSON via `?url`), not Lovable asset pointers, because `/__l5e` asset URLs only resolve on Lovable hosting and the user runs the app locally.
- Dashboard series carry each location's latest cumulative value forward and derive national figures from province changes on dates without a Country row, so rows added for one location still move KPIs to the newest date.
- For city-split workbooks (each Province row holds one city's population share), scale Province rows back up by that share in covid-data and keep raw city rows separately, so province/island/national views stay accurate while the city level uses the file's own values.
- Tambah Data's simple mode derives the other columns in the pure `src/lib/record-derive.ts` from reference rows served read-only by `api/records/context.php`; the derived full rows then go through the normal validate/save path, so the backend still re-validates everything.
