import com.neverlift.backend.race.physics.*;
import java.util.*;

/** Local capacity probe, deliberately not a hardware-sensitive CI assertion. */
public class PhysicsBenchmark {
    public static void main(String[] args) {
        PhysicsContract contract = new PhysicsContract();
        TrackGeometry track = new TrackGeometry(contract, PhysicsContract.resource("tracks/albert-park.json"));
        List<RaceEngine.Entrant> entrants = new ArrayList<>();
        for (int index = 0; index < 22; index++) entrants.add(new RaceEngine.Entrant("car-" + index, index > 0, "normal", track.spawn(index)));
        RaceEngine engine = new RaceEngine(contract, track, entrants);
        for (int tick = 0; tick < 120; tick++) engine.tick(tick * 33_333_333L);
        double[] samples = new double[120];
        for (int tick = 0; tick < samples.length; tick++) {
            long start = System.nanoTime(); engine.tick((tick + 120) * 33_333_333L);
            samples[tick] = (System.nanoTime() - start) / 1_000_000.0;
        }
        Arrays.sort(samples);
        System.out.printf(Locale.ROOT, "22 cars, four substeps/tick: mean %.3f ms; p95 %.3f ms; budget %.3f ms; contacts %d%n",
                Arrays.stream(samples).average().orElseThrow(), samples[113], contract.number("simulation", "serverTickSeconds") * 1000, engine.resolvedContacts());
    }
}
