Improvements (Output Formatting)
UI improvements

**Chat Window**
Most parts of claudes output is not rendered properly (including formulaes, bolded numbers , structure of output etc)
ex:
f is built from two pieces: f = σ ∘ g
This means "first apply *g*, then apply *σ*."
- g : ℝ^d → ℝ^k — the raw network. It outputs *K* unbounded scores called logits (any real numbers, positive or negative — not yet probabilities).
- σ — the softmax function. It squashes those logits into proper probabilities. The formula

$$\sigma_i(z) = \frac{e^{z_i}}{\sum_{j} e^{z_j}}$$

Here i dont see an output that is structured
most formulae are unrendered ($$\sigma_i(z) = \frac{\exp(z_i)}{\sum_{j=1}^{k}\exp(z_j)}$$)
paragraph and bulletin points are not clearly defined


