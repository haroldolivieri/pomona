# Independent purchase-unit annotations

Annotations were drawn from source pixels, independently of model outputs. Coordinates use normalized [ymin,xmin,ymax,xmax]. Every emitted candidate must match a distinct annotated unit at IoU >= 0.5 with its center inside that annotation. Required units define the minimum clearly separable inventory; optional units record additional plausible units when overlap makes complete recall uncertain. Thresholds are shared across scenes. The count field must still equal the emitted candidate list exactly.

## 20: clear tomato display

The source contains 42 foreground tomatoes. Applying the original focus polygon to their centers leaves 41 eligible units; t02 is outside. All 41 are annotated as candidate anchors, but full recall is not required because many overlap. Each returned box must still match a different tomato, and the original minimum of 30 remains. Background crates and onions are ineligible. The ripe-versus-underripe regions remain independent grading checks.

## 15: banded banana bunches

The replacement photo shows nine distinct banded bunch regions. Each visible banded bunch is one purchase unit; do not split a bunch into individual bananas. Five required annotations mark clear bunches; four optional annotations cover additional bunches with overlapping boundaries. Count must equal candidates exactly. Yellower fruit is ripe; greener yellow fruit is almost ripe. The upper back bunch is visibly more yellow than the greener front bunch and should win ready_now.
