# Signal Lab

Six "brains" compete to set the traffic lights of a small city so that cars wait as little as possible. Everything runs live in the browser.

**Team:** Shlok Shah (R059) · Kevin Pratap (R064) · Sudiksha Singh (R066)

## Run it

- **Online:** https://shlokshah25.github.io/signallab/
- **Offline:** download the repo (Code → Download ZIP), unzip it, and double-click `index.html`. The three files (`index.html`, `core.js`, `bench.js`) must stay in the same folder.

The page opens in **Simple** mode with everyday explanations. The **Explain it** toggle at the top right switches to **Technical**.

## The methods

| Nickname | Algorithm | Idea | In syllabus? |
| --- | --- | --- | --- |
| Evolution | Genetic Algorithm (GA) | Survival of the fittest | Yes |
| Ant colony | Ant Colony Optimisation (MAX-MIN) | Follow the scent of good choices | Yes |
| Bird flock | Particle Swarm Optimisation (PSO) | Fly towards where you and your friends found food | Yes |
| Cooling metal | Simulated Annealing (SA) | Be bold early, careful later | Yes |
| Smart learner | CMA-ES | Learn which dials work together | No, beyond syllabus |
| Traffic cop | Max-Pressure | Don't plan ahead, just react | No, beyond syllabus |

## The model

- 3×3 grid: 9 signalised junctions, 36 approaches, left-hand driving.
- Each signal: 60 s cycle, two phases, 3 s amber + all-red lost per switch.
- Store-and-forward queues: 1800 veh/h saturation flow, 8 s travel between junctions, 76% straight / 12% left / 12% right.
- A plan is 18 numbers: a green split and an offset per junction.
- Score: average delay per vehicle over a 15-minute peak. Vehicles still queued at the end cost 90 s each.
- Every optimiser gets the same budget: 3,000 simulations.

## Results (arterial rush hour, 10 seeds × 3,000 evaluations)

| Method | Mean delay (s) | ± SD | Best | Worst | vs untuned | Evals to 95% |
| --- | --- | --- | --- | --- | --- | --- |
| Simulated Annealing | 28.21 | 0.11 | 28.06 | 28.40 | −44.4% | 1313 |
| Genetic Algorithm | 28.33 | 0.17 | 28.15 | 28.69 | −44.1% | 312 |
| Particle Swarm | 28.45 | 0.69 | 28.02 | 30.22 | −43.9% | 296 |
| CMA-ES | 28.95 | 1.32 | 28.03 | 31.58 | −42.9% | 525 |
| Ant Colony | 29.59 | 0.54 | 28.84 | 30.49 | −41.6% | 711 |
| Max-Pressure | 31.24 | – | – | – | −38.4% | live |
| Fixed 50/50 (untuned) | 50.70 | – | – | – | – | – |

On a **balanced grid**, Max-Pressure wins outright (20.98 s against 28.71 s for the best optimiser). On the **arterial** and **morning inbound** patterns, optimised fixed plans win, because they coordinate green waves.

## Files

- `index.html`: the app (interface, drawing, explanations).
- `core.js`: the traffic simulator and all six algorithms.
- `bench.js`: precomputed 10-seed benchmark results.
- `SCRIPT.md`: the presentation script, split between the three of us.
- `Signal-Lab-Presentation.pdf`: the slides.

**Speaking order:** Sudiksha (slides 1–5) → Kevin (6–11) → Shlok (12–18 and Q&A).

## References

- Hansen, N. & Ostermeier, A. (2001). Completely derandomized self-adaptation in evolution strategies. *Evolutionary Computation*, 9(2).
- Varaiya, P. (2013). Max pressure control of a network of signalized intersections. *Transportation Research Part C*, 36.
- Stützle, T. & Hoos, H. (2000). MAX–MIN Ant System. *Future Generation Computer Systems*, 16(8).
