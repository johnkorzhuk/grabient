import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";

export class ExampleWorkflow extends WorkflowEntrypoint<
  Env,
  ExampleWorkflowParmas
> {
  async run(
    event: Readonly<WorkflowEvent<ExampleWorkflowParmas>>,
    step: WorkflowStep,
  ) {
    const randomNumber = await step.do("Get random number", async () => {
      return Math.floor(Math.random() * 10) + 1;
    });

    await step.sleep(
      "Wait for random number of seconds",
      `${randomNumber} seconds`,
    );

    await step.do("Log data in payload", async () => {
      console.log(event.payload);
    });
  }
}
