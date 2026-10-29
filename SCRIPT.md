# Signal Lab Presentation Script

Shlok Shah (R059) · Kevin Pratap (R064) · Sudiksha Singh (R066)

## Running order

The talk runs about 17 minutes in three parts, plus questions. Lines in square brackets are actions, not words to say. Sudiksha has the most descriptive part, Kevin the four syllabus algorithms, and Shlok the most technical part plus the Q&A.

| Part | Presenter | Slides | Covers | Time |
| --- | --- | --- | --- | --- |
| 1 | Sudiksha Singh (R066) | 1–5 | Intro, what we did, the problem, the city, encoding | ~5.5 min |
| 2 | Kevin Pratap (R064) | 6–11 | Live demo, GA, ACO, PSO, SA, beyond-syllabus intro | ~6 min |
| 3 | Shlok Shah (R059) | 12–18 | CMA-ES, Max-Pressure, results, conclusions, Q&A | ~6.5 min |

Keep the Signal Lab app open in a second tab for the demo on slide 6. It opens in Simple mode (everyday nicknames and analogies); the Explain it toggle at the top right switches to Technical if an examiner asks for the maths. The same script is in each slide's speaker notes.

## Part 1 · Sudiksha Singh (R066) · slides 1–5

**Slide 1 · Signal Lab (cover)**

Good morning everyone. We are Sudiksha, Kevin and Shlok, and our project is called Signal Lab. The question we asked is simple: if you hand the traffic lights of a small city to an optimisation algorithm, which algorithm gives drivers the shortest wait? We compared the four algorithms from our syllabus: the Genetic Algorithm, Ant Colony Optimisation, Particle Swarm Optimisation and Simulated Annealing. Then we went beyond the classroom with two more: CMA-ES, a research-grade evolution strategy, and Max-Pressure, an adaptive controller that doesn't need optimisation at all. Everything you will see today runs live in the browser.

**Slide 2 · What we did**

Before we get into the details, here is what we actually did, in four steps. First, we built a city: a traffic simulator with nine crossroads and fifteen minutes of rush-hour traffic. You give it a set of light timings, and it tells you how long the average car waits at red lights. That one number is our score. Second, we coded six different “brains” to choose those timings. Four come from our syllabus: the Genetic Algorithm, Ant Colony Optimisation, Particle Swarm and Simulated Annealing. Two we learned on our own: CMA-ES and Max-Pressure. We wrote all of them from scratch, and they all tune the same eighteen dials.

Third, we ran a fair race. Every method got exactly three thousand tries, we repeated the race ten times with different random starting points so nobody wins by luck, and we did it on three different traffic patterns. Fourth, we made it visible: a live web app where you can watch every method learn, open any one of them up, change its settings and race again. The headline result is at the bottom of the slide: ordinary, untuned lights make the average car wait 50.7 seconds, and our best plans bring that down to about 28 seconds, a 44 percent cut. Now let me explain why this is a hard problem in the first place.

**Slide 3 · A signal plan is a hard search problem**

Why is this a soft-computing problem? First, size: nine junctions with two numbers each gives eighteen continuous variables. Second, there is no formula for delay. You can't differentiate it; you have to simulate the traffic and measure it, so the objective is a black box. Third, the landscape is rugged. One junction's offset only makes sense relative to its neighbours, because a green wave needs each light to turn green just as the platoon from upstream arrives. That interaction creates many local optima, which is exactly where population-based and stochastic methods earn their keep.

**Slide 4 · Nine junctions, 15 minutes of peak traffic**

Here is the city we built: a three-by-three grid, so nine signalised junctions and thirty-six approaches. Each signal runs a sixty-second cycle with two phases, north–south and east–west, and loses three seconds of amber and all-red on every switch. Traffic is modelled as queues. On green, each approach discharges 1800 vehicles per hour, and vehicles take eight seconds to reach the next junction, where most go straight and some turn. Demand enters from the edges and peaks in the middle of a fifteen-minute window. Our main scenario is an arterial rush hour, with heavy eastbound commuters on the middle road, shown by the amber arrow. We also tested a balanced grid and a morning-inbound pattern.

**Slide 5 · Every algorithm sees the same 18 numbers**

To make the comparison fair, every algorithm searches exactly the same space. A solution is a vector of eighteen numbers between zero and one. For each junction there is a split, which sets how much of the cycle goes to north–south green, and an offset, which shifts when the cycle starts. Offsets wrap around, so 0.99 and 0.01 are neighbours. The fitness is average delay per vehicle: we add up every second each vehicle spends queuing and divide by the number of vehicles that entered. Anything still stuck at the end is penalised. One evaluation is a full fifteen-minute simulation, and every algorithm gets the same budget of three thousand evaluations, so we compare intelligence, not effort. Now Kevin will show you the tool live.

## Part 2 · Kevin Pratap (R064) · slides 6–11

**Slide 6 · Live demo**

Thanks, Sudiksha. Let me show you the tool. [Switch to the Signal Lab app.] The page opens in Simple mode, so every method has an everyday nickname: Evolution, Ant colony, Bird flock, Cooling metal, Smart learner and Traffic cop. The top strip explains the city, the puzzle and the contestants, and the amber line tells you who is winning right now. Each of these six tiles is a live simulation of the grid. Red squares are queued cars, dark squares are moving cars, and the bars at each stop line are the signals. As the search runs, each tile switches to the best plan its algorithm has found so far, so you can literally watch the queues shrink. On the right is the convergence race: delay against the number of simulations spent. The dashed lines are the untuned 50/50 plan and Max-Pressure. [Click the Smart learner tile.] Expanding a tile opens its detail view, which starts with the idea in plain words, then shows the search space for the centre junction, the full timing plan and the algorithm's parameters, which we can change and rerun. [Close the view and return to the slides.] Now let's look at how each algorithm works, starting with the one most of you know best.

**Slide 7 · Genetic Algorithm**

In our Genetic Algorithm, each chromosome is one complete timing plan with eighteen genes, and we keep thirty plans. Each generation we simulate all of them, copy the two best straight through as elites, and fill the rest with children. Parents are chosen by tournament: draw three plans at random and take the best. Because our genes are real numbers, we use BLX-alpha crossover, which picks each child gene from a range slightly wider than its two parents, followed by a small Gaussian mutation; offsets wrap around the cycle. In traffic terms, if one plan has a good green wave on the west side and another has one on the east, crossover can combine them. Across ten seeds, GA reached 28.33 seconds of average delay with a very small spread, and got 95 percent of its improvement in about 300 evaluations. Fast and reliable. Next, the swarm algorithms.

**Slide 8 · Ant Colony Optimisation (MAX-MIN)**

Ant Colony Optimisation was designed for path problems like the travelling salesman, so we had to turn signal timing into a path. We cut every split and every offset into twelve levels. An ant walks through eighteen decision points and picks one level at each, with probability proportional to the pheromone on that level. After each batch of fifteen ants, all pheromone evaporates by eight percent, and the levels used by this round's best ant and the best ant ever get reinforced. We used the MAX-MIN variant, which clamps pheromone between bounds so the colony can't commit too early. ACO was the weakest here, at 29.6 seconds. The reason is the representation: twelve levels means offsets in five-second steps, which is too coarse to fine-tune a green wave. ACO is excellent on discrete, path-like problems, but continuous timing is not its home ground.

**Slide 9 · Particle Swarm Optimisation**

Particle Swarm treats each plan as a particle with a position and a velocity in eighteen-dimensional space. Every step, its velocity mixes three things: inertia, so it keeps moving; a pull back towards the best plan it has personally found; and a pull towards the best plan anyone in the swarm has found. We used the standard constriction values, 0.72 and 1.49, and a speed limit so particles don't overshoot. PSO was the fastest learner of all, with 95 percent of its improvement in under 300 evaluations. Its weakness showed in the spread: in one of ten seeds the whole swarm collapsed onto a mediocre plan at 30.2 seconds, because once everyone follows the same leader, diversity disappears.

**Slide 10 · Simulated Annealing**

Simulated Annealing is the odd one out: no population, just one plan. Each move changes one to three genes slightly. If the new plan is better, we keep it. If it's worse, we may still keep it, with probability e to the minus delta over T. At high temperature the search wanders and escapes local minima; as the temperature cools from 3 to 0.01 over the budget, it becomes a careful local search. The result surprised us: SA had the best average and the tightest spread of all, at 28.21 seconds. But look at the cost: it needed over 1300 evaluations to get most of its gain, four times longer than PSO. SA trades speed for thoroughness, and with a budget of only 500 evaluations it would come last. Shlok will come back to that trade-off in the results.

**Slide 11 · Beyond the syllabus**

Everything so far comes from our syllabus. We wanted to see how these classroom methods compare with what researchers and traffic engineers actually use, so we added two methods we had to learn on our own. The first is CMA-ES, an evolution strategy that is a standard baseline in black-box optimisation research. The second is not an optimiser at all. Max-Pressure is an adaptive controller that decides every second, from the live queues, which direction gets green. It asks a different question: do we even need to optimise a fixed plan? Shlok will take you through both, and then our results.

## Part 3 · Shlok Shah (R059) · slides 12–18

**Slide 12 · CMA-ES**

Thanks, Kevin. CMA-ES keeps a multivariate Gaussian over the search space. Each generation it samples twelve plans, ranks them, and moves the mean towards the best six. The clever part is that it also reshapes the Gaussian by updating its covariance matrix. If good plans tend to have the offsets of junctions 4 and 5 moving together, which is exactly what a green wave is, the covariance learns that correlation and future samples follow it. It also tunes its own step size, so there are only two settings to choose. In our app's detail view you can see this as a rotating ellipse. CMA-ES produced the best single run on the arterial, 28.03 seconds, and the best average of all on the balanced grid. Its arterial mean was pulled up by one seed that converged too early, at 31.6. The standard fix in research is restarts with a growing population, called IPOP-CMA-ES, which is our first item of future work.

**Slide 13 · Max-Pressure**

Max-Pressure comes from control theory, not soft computing. Instead of searching offline for a good fixed plan, each junction looks at its live queues every second. For each phase it computes a pressure: the cars waiting on those approaches minus the cars already queued where they're heading. It serves the phase with the higher pressure, with a ten-second minimum green so it doesn't flicker. Varaiya proved in 2013 that this maximises throughput. Our results show both its power and its limit. On the balanced grid it got 21 seconds, 27 percent lower than the best optimised fixed plan, because it reacts to whatever queue is actually there. On the arterial and inbound scenarios the optimised fixed plans win, because they coordinate offsets into green waves along the busy corridor, while Max-Pressure only ever looks at one junction at a time. So the answer to "do we need to optimise?" is: it depends on the traffic.

**Slide 14 · Results table**

Here is the full comparison on the arterial rush hour: ten random seeds per algorithm, all on the same budget of three thousand evaluations. The first headline is that tuning matters enormously. The untuned 50/50 plan causes over 50 seconds of delay per vehicle, and every single metaheuristic cut that by more than 40 percent. The second headline is how close the top four are: Simulated Annealing, GA, PSO and CMA-ES all average between 28.2 and 29 seconds. The real differences are in the other columns. SA and GA are the most consistent, with tiny standard deviations. PSO and CMA-ES produced the two best individual runs, but each had an outlier seed. And in the last column, GA and PSO get there four times faster than SA.

**Slide 15 · Convergence chart**

This chart shows the best-so-far delay, averaged over all ten seeds, as evaluations are spent. The blue and red lines, PSO and GA, dive almost immediately: by 500 evaluations they are near 30 seconds and already beat Max-Pressure. Simulated Annealing, in teal, starts worst because it explores with a single point at high temperature, but it keeps improving right to the end and finishes lowest. CMA-ES is slower at first while it learns its covariance, then drops sharply around 1000 evaluations. ACO, in purple, improves steadily, but its five-second resolution keeps it above the others. The practical lesson: if each simulation were expensive, say a real traffic simulator taking minutes per run, PSO or GA would be the right choice. With a generous budget, SA gives the best final plan.

**Slide 16 · Three traffic patterns**

We repeated the whole benchmark on three traffic patterns, and this is the most interesting finding of the project. On the arterial rush, the best optimised plan, from Simulated Annealing, beats Max-Pressure, because one dominant corridor rewards coordinated offsets. On the balanced grid it flips completely. There is no corridor to coordinate, the untuned plan is already reasonable, and Max-Pressure, reacting to live queues, gets 21 seconds against 28.7 for the best optimiser: 27 percent less delay. On the morning inbound pattern, one corner junction is saturated from two directions. Max-Pressure keeps switching and losing amber time, so it does no better than the untuned plan, while the optimised plan saves almost 7 seconds per vehicle.

**Slide 17 · What we learned**

To wrap up, four lessons. One: tuning matters more than which algorithm you pick. All five cut delay by over 40 percent, and the top four ended within a second of each other. Two: there is a clear trade-off between speed and final quality; PSO and GA are fast, SA is thorough. Three: representation matters. ACO did worst not because it is a bad algorithm, but because discretising a continuous problem throws away precision. Four: there is no single winner. Adaptive Max-Pressure dominates when demand is balanced, and coordinated optimised plans dominate on a busy corridor. That points to our future work: a hybrid that optimises offsets offline with a metaheuristic and lets Max-Pressure adapt the splits live, restarts for CMA-ES, and moving from our model to a real road network in the SUMO traffic simulator.

**Slide 18 · Questions?**

Thank you for listening. We're happy to take questions. If you'd like, we can rerun any algorithm live with different parameters, or switch the traffic scenario and watch the ranking change. [Shlok leads the Q&A and passes questions on the intro to Sudiksha and on the four syllabus algorithms to Kevin.]

## Likely questions

| Question | Who answers | Short answer |
| --- | --- | --- |
| Is the simulator realistic? | Sudiksha | It is a store-and-forward queue model, standard in signal-control research. It ignores spillback and lane changes; SUMO is the next step. |
| Why only 3,000 evaluations? | Sudiksha | Same budget for all keeps it fair, and real simulators are far slower, so sample efficiency matters. |
| Why did ACO lose? | Kevin | Discretisation: 12 levels give 5 s offset steps. More levels help but slow learning; try it live in the app. |
| How did you pick parameters? | Kevin | Standard published defaults (PSO constriction 0.72/1.49, CMA-ES default λ). Every one is adjustable in the app. |
| Why is CMA-ES not clearly best? | Shlok | One seed converged early. Its best run was near the top; IPOP restarts are the usual fix. |
| Isn't Max-Pressure unfair to compare? | Shlok | It is a different paradigm, which is the point: it shows when optimising a fixed plan is worth it. |
| Are the differences significant? | Shlok | Top four are within 0.8 s; SA vs ACO is clear (1.4 s apart, SDs ≈ 0.1–0.5). A rank test would be next. |
