import { SlashCommandBuilder } from "@discordjs/builders";
import {
  Client,
  CommandInteraction,
  FetchedThreads,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  MessageSelectMenu,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import {
  Categories,
  getQuestions,
  TriviaCategoryResolvable,
  TriviaQuestionDifficulty,
} from "easy-trivia";
import config from "../config"; 

export const data = new SlashCommandBuilder()
  .setName("trivia")
  .setDescription("start trivia game")
  .addSubcommand((subcommand) =>
    subcommand.setName("play").setDescription("Play a trivia game!")
  );

const gameInProgress = false;
const sleep = (time:any) => new Promise(resolve => setTimeout(resolve,time));

export async function execute(interaction: CommandInteraction, client: Client) {
  if (!interaction?.channelId) {
    return;
  }
  if (gameInProgress)
    return interaction.reply(
      "Please wait for the current game to end before starting a new one!"
    );

  const channel = await client.channels.fetch(interaction.channelId);
  const threads = await interaction.guild?.channels.fetchActiveThreads();
  if (!channel || channel.type != "GUILD_TEXT") {
    return;
  }

  const triviaStartEmbed = new MessageEmbed()
    .setColor("#ffa500")
    .setTitle("Trivia Selector")
    .setDescription("Select your trivia options!" + "\u2800".repeat(24));

  let category: any = Categories;
  let categoryArray: any = category.allNames;
  let catArr = categoryArray.map((category: string) => ({
    label: category,
    value: category,
  }));
  catArr.unshift({ label: "RANDOM", value: "RANDOM" });

  const rowArr = [
    new MessageActionRow().addComponents(
      new MessageSelectMenu()
        .setCustomId("triviaQuestionSelect")
        .setPlaceholder("How many Questions?")
        .addOptions([
          { label: "5", value: "5" },
          { label: "10", value: "10" },
          { label: "15", value: "15" },
          { label: "20", value: "20" },
        ])
    ),
    new MessageActionRow().addComponents(
      new MessageSelectMenu()
        .setCustomId("triviaCategorySelect")
        .setPlaceholder("Which Category?")
        .addOptions(catArr)
    ),
    new MessageActionRow().addComponents(
      new MessageSelectMenu()
        .setCustomId("triviaDifficultySelect")
        .setPlaceholder("Which Difficulty?")
        .addOptions([
          { label: "Easy", value: "easy" },
          { label: "Medium", value: "medium" },
          { label: "Hard", value: "hard" },
        ])
    ),
    new MessageActionRow().addComponents(
      new MessageButton()
        .setLabel("Start")
        .setCustomId("triviaStartButton")
        .setStyle("SUCCESS")
    ),
  ];

  await interaction.reply({
    ephemeral: true,
    embeds: [triviaStartEmbed],
    components: rowArr,
  });

  let triviaOptions = {
    numofquestions: "",
    category: "",
    difficulty: "",
  };

  let selectCollector = interaction.channel?.createMessageComponentCollector({
    componentType: "SELECT_MENU",
  });
  selectCollector?.on("collect", (msg) => {
    switch (msg.customId) {
      case "triviaQuestionSelect":
        triviaOptions.numofquestions = msg.values[0];
        break;
      case "triviaCategorySelect":
        if (msg.values[0] == "RANDOM") {
          triviaOptions.category = String(Categories.random());
        } else {
          triviaOptions.category = msg.values[0];
        }
        break;
      case "triviaDifficultySelect":
        triviaOptions.difficulty = msg.values[0];
        break;
    }
    msg.deferUpdate();
  });

  let startCollector = interaction.channel?.createMessageComponentCollector({
    componentType: "BUTTON",
  });
  startCollector?.on("collect", (msg) => {
    if (msg.customId == "triviaStartButton") {
      // Validate all select menus filled
      if (
        !triviaOptions.category ||
        !triviaOptions.difficulty ||
        !triviaOptions.numofquestions
      ) {
        return interaction.reply({
          ephemeral: true,
          content: "Please select all menus",
        });
      }

      msg.deferUpdate();

      selectCollector?.stop();
      startCollector?.stop();

      // create join embed
      let joinEmbed = new MessageEmbed()
        .setTitle("New Trivia Game")
        .setDescription(
          `\n**Questions:** ${triviaOptions.numofquestions}\n**Category:** ${triviaOptions.category}\n**Difficulty:** ${triviaOptions.difficulty}\n`
        )
        .setThumbnail(client.user?.displayAvatarURL() || "")
        .addField("Joined Players", `<@${msg.user.id}>\n`)

      let joinEmbedButton = new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId("triviaJoinButton")
          .setLabel("Join (15 Seconds)")
          .setStyle("SUCCESS")
      ); 


      let joinMsg = msg.channel?.send({
        content: `<@${msg.user.id}>`,
        embeds: [joinEmbed],
        components: [joinEmbedButton],
      })

      let joinedPlayers:any = [msg.user.id];

      let joinCollector = joinMsg?.then(m=>m.createMessageComponentCollector({componentType:"BUTTON"}))
      joinCollector?.then(m => {
        m.on('collect', (msg) => {
          if(msg.customId == "triviaJoinButton"){
            let currentPlayers = msg.message.embeds[0].fields?.filter(field => {
              if(field.name == "Joined Players"){
                return field.value;
              }
            })[0].value;

            if(joinedPlayers?.includes(msg.user.id)){
              msg.reply({ephemeral:true, content:"You have already joined!"});
            }else{
              // add to players
              joinedPlayers.append(msg.user.id);
              let embed = new MessageEmbed(msg.message.embeds[0]).setFields({name:"Players",value:`${currentPlayers}\n<@${msg.user.id}>`})  
              joinMsg?.then(m => m.edit({embeds:[embed]})) 
              msg.deferUpdate();
            }
          }
          
        })
      })

      sleep(Number(config.JOIN_WAIT_TIME)*1000).then(async ()=>{
        triviaGame(interaction, joinedPlayers, threads as any);
      })
    }
  });

  async function triviaGame(interaction: CommandInteraction, joinedPlayers: [], threads: FetchedThreads) {

      let scoreDict : any = {};
      joinedPlayers.forEach(v => {
        scoreDict[v] = 0;
      })
      // Define answer buttons
      const multipleQuestionComps = new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId("A")
          .setLabel("A")
          .setStyle("PRIMARY"),
        new MessageButton()
          .setCustomId("B")
          .setLabel("B")
          .setStyle("PRIMARY"),
        new MessageButton()
          .setCustomId("C")
          .setLabel("C")
          .setStyle("PRIMARY"),
        new MessageButton()
          .setCustomId("D")
          .setLabel("D")
          .setStyle("PRIMARY")
      );

      const booleanQuestionComps = new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId("A")
          .setLabel("A")
          .setStyle("PRIMARY"),
        new MessageButton()
          .setCustomId("B")
          .setLabel("B")
          .setStyle("PRIMARY")
      );

      // Get Trivia Questions
      const questions = await getQuestions({
        amount: Number(triviaOptions.numofquestions),
        difficulty: triviaOptions.difficulty as TriviaQuestionDifficulty,
        category: triviaOptions.category as TriviaCategoryResolvable,
      });
      
      const triviaThreads = threads.threads.filter(x => x.name == "wumbot-trivia-thread" && x.archived == false);
      let thread: ThreadChannel; 
      if(triviaThreads.size > 0){
        thread = triviaThreads.first() as ThreadChannel;

      }else{
        // create game thread
        thread = await (channel as TextChannel).threads.create({
          name: `wumbot-trivia-thread`,
          reason: `Wumbot Trivia Game`,
        });
      }


      // start message
      (await thread).send({content: joinedPlayers.map(x=>`<@${x}>`).join(' ') + "\n**Starting in 10 seconds**\n(15 seconds per question)\n"})
      await sleep(Number(config.JOIN_WAIT_TIME)*1000);

      for (let questNum in questions) {
        // if(Number(questNum) > 1){return;}
        let question = questions[questNum];
        let currentAnswers : any = {};
        joinedPlayers.forEach(function(v, i){
          currentAnswers[v] =  "";
        })

        const embed = new MessageEmbed()
          .setTitle("Question #" + (Number(questNum)+1))
          .setColor("#0099ff")
          .setDescription(
            question.value +
              "\n\n:regional_indicator_a: " +
              question.allAnswers[0] +
              "\n:regional_indicator_b: " +
              question.allAnswers[1] +
              (question.allAnswers[2]
                ? "\n:regional_indicator_c: " + question.allAnswers[2]
                : "") +
              (question.allAnswers[3]
                ? "\n:regional_indicator_d: " + question.allAnswers[3]
                : "")
          );

        let questionComp = question.type == "multiple" ? multipleQuestionComps : booleanQuestionComps; 

        let msg = (await thread).send({
          embeds: [embed],
          components: [questionComp],
        });

        let answerCollector = (await msg).createMessageComponentCollector({"componentType":"BUTTON"});
        answerCollector.on('collect', (m) => {
            if(m.user.id in currentAnswers){
                currentAnswers[m.user.id] = m.customId;
                return m.reply({ephemeral:true, content: "Your answer: " + question.allAnswers[m.customId.charCodeAt(0)%65]})
            }else{
              m.deferUpdate();
            }
        });

        await sleep(Number(config.WAIT_TIME_FOR_ANSWER)*1000);
        answerCollector.stop();

        for(let key in currentAnswers){
          let answer = question.allAnswers[currentAnswers[key].charCodeAt(0)%65];
          if(question.checkAnswer(answer)){
            scoreDict[key] += 1;
          }
        }


    (await thread).send({content: "**Correct Answer: " + question.correctAnswer + "**\n"}); 
    }

    let scoresArr = Object.entries(scoreDict);
    scoresArr.sort((a:any,b:any) => b[1]-a[1]);
    let scoresStr = "";
    scoresArr.forEach(function(s, i){
      if(i == 0){
        scoresStr += ":first_place:";
      }else if(i == 1){
        scoresStr += ":second_place:";
      }else if(i == 2){
        scoresStr += ":third_place:";
      }else{
        scoresStr += ":poop:"
      }
      scoresStr += "\u0009<@"+s[0]+">\u0009"+s[1]+"/"+triviaOptions.numofquestions+"\n";
    })

    let scoresEmbed = new MessageEmbed()
    .setTitle("Final Scores")
    .addField("\u2800",scoresStr);

    await sleep(1000);
    (await thread).send({content: "\u2800",embeds:[scoresEmbed]});
  }
}