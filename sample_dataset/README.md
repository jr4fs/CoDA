
# Sample task bundle: Pangolin conservation sentiment

A ready-to-upload demo bundle for users to try the codebook-development flow.
It's a small, curated subset of a public wildlife-trafficking social-media dataset:
short, readable, English pangolin posts spanning three conservation-sentiment
labels (`positive`, `negative`, `neutral`).

## Files

| File | Rows | Columns | Use in the upload form |
|------|------|---------|------------------------|
| `d_all.csv` | 11 (unlabeled) | `translated_text` | **Unlabeled dataset** — the pool samples are drawn from |
| `d_val.csv` | 4 (labeled) | `translated_text`, `Final Label` | **Labeled dataset** — held-out validation set for evaluation |
| `labels.json` | 3 labels | — | **Label set** |
| `task.json` | — | — | **Task details** |

## How to use

1. Navigate to: [https://coda.44.218.57.167.sslip.io/](https://coda.44.218.57.167.sslip.io/)
2. Log in with: Email- tutorial@gmail.com, Password- Demotask@123
3. Download the toy dataset in this folder
4. On the "Create Task" page, keep the defaults:
- **Text column** = `translated_text`
- **Label column** = `Final Label`
- **Budget** = whatever you want to review, we recommend 15 for a lightweight example (default comes from the deployment)

Upload the four files into their matching slots, create the task, then work through
the interface review to build and export a codebook.
