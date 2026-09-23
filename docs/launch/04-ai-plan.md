# The AI: open-source models, training, and what is actually free

You asked how to train an open-source model so the tool answers from its own AI.
This document explains what that involves, what it would cost in your ten days,
and what I recommend instead — with the reasoning, so you can disagree.

## First, the uncomfortable part

**Training does not make a model's numbers true.**

A language model trained on emission data learns the *shape* of the answer:
that a T-shirt has a cotton line and a dyeing line, that factors for steel are
around 2 kg CO₂e per kg. It does not learn a lookup table. Ask for a material it
saw twice during training and it will still produce a confident number that is
wrong by a factor of three, and you cannot tell which numbers came from real data
and which it invented.

For a carbon tool, that is the whole ball game. Your customer's auditor will ask
"where did 2.1 come from?" and "the model remembered it" is not an answer.

**What makes numbers defensible is a factor registry**: a table with value, unit,
year, region, source and licence, with the arithmetic done in code. You have
already built that — `ghg_core` with exact decimal arithmetic, a fallback ladder,
and provenance on every line. It currently holds **zero verified factors**, so
the AI is doing all the work. Filling it is the highest-value AI work available
to you, and it is not model training at all.

The right division of labour:

| Job | Who does it |
|---|---|
| Understand "1.5-ton 5-star split AC" and break it into lifecycle inputs | The AI |
| Decide quantities: how much aluminium, how many kWh over ten years | The AI, as an estimate |
| Supply the emission factor for aluminium | **Your registry**, when it has one |
| Multiply, sum, produce ranges and shares | **`ghg_core`**, never the AI |
| Write the analysis and reduction ideas | The AI |

This is already how the service works. Fine-tuning would improve the first, second
and last rows a little. It would do nothing for the third, which is what accuracy
actually means here.

## Option A — an open model, free, no training (recommended for launch)

You can drop Google and run on open-source models this week, for nothing, because
the service already supports a chain of providers.

Open models good enough for this task today: **Llama 3.3 70B**, **Qwen 3 32B/72B**,
**Mistral Large / Mixtral**, **DeepSeek V3**, **gpt-oss 120B**. Several providers
serve them on free tiers:

| Provider | What is free | Notes |
|---|---|---|
| **Groq** | A generous free tier on Llama and Qwen models | Extremely fast; the usual first choice |
| **OpenRouter** | Several models offered in a free variant | One account, many models, easy to switch |
| **Cloudflare Workers AI** | A daily free allowance | Runs at the edge, also gives you Pages |
| **Together / Fireworks** | Trial credit, then paid | Good when you outgrow free tiers |

**Work needed:** a provider class like `service/gemini.py` (about 150 lines), plus
a model profile and tests. **One day.** They all speak a similar HTTP API, and the
structured-output handling is the only fiddly part. You keep Gemini and Claude in
the chain as fallbacks, so an outage at one provider is invisible to visitors.

**Cost when free tiers run out:** roughly US$0.10–0.60 per million tokens for an
8B–70B open model. At about 1,000 input and 3,000 output tokens per estimate,
that is **₹0.03–0.15 (US$0.0005–0.002) per estimate** — 1,000 estimates a month
for well under ₹200.

## Option B — self-hosting an open model on your own server

**On a CPU-only server (the cheap ones above):** possible with Ollama and a
quantised 7–8B model (about 5 GB of disk, 6–8 GB of memory), but slow. Expect
roughly 5–15 tokens a second, so a 3,000-token answer takes **four to ten
minutes**. Visitors will not wait. Not viable for a live page.

**On a GPU:** an RTX 4000-class cloud GPU runs an 8B model at 50–100 tokens a
second — about 30–60 seconds per estimate, which is acceptable. It costs roughly
**US$0.20–0.50 an hour, i.e. ₹12,000–30,000 a month** if left running. That is
ten to a hundred times what the same work costs through a free or paid API.

**Verdict:** self-hosting makes sense when you have volume, a privacy requirement
that forbids sending text to a third party, or a fine-tuned model of your own. At
launch you have none of those.

## Option C — fine-tuning your own model (what it would really take)

If you still want it, here is the whole job, honestly.

### 1. Training data — the real work

You need examples of exactly what you want out: a product description in, your
structured lifecycle JSON out.

- **How many:** 500 is enough to teach the format; 2,000–5,000 to change
  behaviour meaningfully.
- **Where from:** you have two sources and both have a catch.
  - *Your own production logs.* The right answer, but you have 19 cached
    estimates today. After a few months of real use you would have thousands.
  - *Generating them with another AI.* Fast, but **check the provider's terms
    first** — several, Google's included, restrict using their output to train
    competing models. Do not build your product on a term you have not read.
- **Quality:** every example has to be checked by someone who knows LCA, or you
  are teaching the model to repeat its own mistakes. This is the expensive part:
  **2–4 days of expert time per thousand examples.**

### 2. Hardware — free is genuinely possible

- **Google Colab free tier:** one T4 GPU with 16 GB, session limits of a few
  hours. Enough for LoRA fine-tuning of a 7–8B model in 4-bit.
- **Kaggle Notebooks:** about 30 GPU hours a week, free, often a P100 or two T4s.
  The most generous free option for training.
- Tools: **Unsloth** (fastest on a single small GPU), or Hugging Face `peft` +
  `trl`. All free and open-source.

### 3. Actually training

- Method: **QLoRA** — the base model is loaded in 4-bit and you train a small
  adapter, about 100–300 MB, instead of all 8 billion parameters.
- Base model: **Qwen 3 8B** or **Llama 3.1 8B Instruct**. Check the licence for
  commercial use; both are broadly permissive, Llama has conditions above a very
  large user count.
- Time: **1–3 hours** for 1,000–2,000 examples over 2–3 epochs on a free T4.
- Settings that usually work: rank 16, alpha 32, learning rate 2e-4, batch 1 with
  gradient accumulation 8, sequence length 4,096.

So the training run itself is an afternoon. **The dataset is the project.**

### 4. Serving it

A fine-tuned model is your own weights, so the free provider tiers no longer
apply. You need a GPU (Option B's ₹12,000–30,000 a month), or a
serverless-GPU provider that charges per second and adds a cold start of 10–30
seconds to the first request after idle.

### 5. Realistic timeline

| Step | Time |
|---|---|
| Collect and clean 1,000 examples | 3–5 days |
| Expert review of the data | 2–4 days |
| Set up training, run it, iterate | 1–2 days |
| Evaluate against a held-out set and compare with today's output | 1–2 days |
| Deploy, serve and monitor | 1–2 days |
| **Total** | **8–15 working days**, with a GPU bill afterwards |

That is your entire ten days, spent on the part of the product that is already
working, while the security issues, the backups and the empty factor registry
wait. **This is why I recommend not doing it now.**

## What I would do instead, in this order

1. **Now (1 day):** add an open-model provider (Groq or OpenRouter) to the chain,
   ahead of or alongside Gemini. You get "runs on open-source AI", free, today.
2. **This week (2–3 days):** ingest 30–50 verified factors. This is what turns
   "AI estimate" into "verified where it matters", and it is the difference
   between a demo and a product.
3. **This week (1 day):** build the evaluation set — 30–50 products with expected
   ranges from public sources — so you can prove quality and detect regressions.
4. **Next month:** add retrieval, so the model is shown your registry entries for
   the materials it named instead of recalling factors from memory. This is the
   technique that genuinely improves accuracy, and it needs no training.
5. **Month 2–3, if the data supports it:** fine-tune on your own reviewed
   production examples, to cut tokens and remove the dependency on outside
   providers. By then you will have the examples, and you will know whether the
   cost is justified.

## If you want to try training anyway

Do it **in parallel, off the launch path**, on Kaggle's free GPU hours, using the
19 cached estimates plus whatever you generate this week as a pilot dataset. You
will learn what the work involves without putting the launch at risk. I can write
the export script that turns the estimate cache into a training file, and the
Kaggle notebook, in about half a day — say the word.
