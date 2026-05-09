import Agenda from "agenda";
import env from "./env.js";

const agenda = new Agenda({
  db: { address: env.MONGO_URL, collection: "agendaJobs" },
  processEvery: "30 seconds",
});

export default agenda;
