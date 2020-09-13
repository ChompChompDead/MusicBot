require("dotenv").config()

const { Client, Util, MessageEmbed } = require('discord.js')
const ytdl = require('ytdl-core')
const PREFIX = '!'
const YouTube = require("simple-youtube-api")

const client = new Client({ disableMentions: "everyone" })
const queue = new Map()
const youtube = new YouTube(process.env.GOOGLE_API_KEY)

client.on('ready', () => {
    console.log(`${client.user.tag} is now online`)
});

client.on('message', async message => {
    if (message.author.bot) return;
    if(!message.content.startsWith(PREFIX)) return

    const args = message.content.substring(PREFIX.length).split(" ")
    const searchString = args.slice(1).join(' ')
    const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : ''
    const serverQueue = queue.get(message.guild.id)

    if(message.content.startsWith(`${PREFIX}play`) || message.content.startsWith(`${PREFIX}p`)) {
        const voiceChannel = message.member.voice.channel
        if(!voiceChannel) return message.channel.send("You need to be in a voice channel to play music.")
        const permissions = voiceChannel.permissionsFor(message.client.user)
        if(!permissions.has('CONNECT')) return message.channel.send('I need permissions to connect to the voice channel.')
        if(!permissions.has('SPEAK')) return message.channel.send('I need permissions to play music.')

        try{
            var video = await youtube.getVideoByID(url)
        } catch (error) {
            try {
                var videos = await youtube.searchVideos(searchString, 1)
                var video = await youtube.getVideoByID(videos[0].id)
            } catch {
                return message.channel.send("I couldn\'t find any search results. Try again.")
            }
        }

        const song = {
            id: video.id,
            title: Util.escapeMarkdown(video.title),
            url: `https://www.youtube.com/watch?v=${video.id}`
        }

        if(!serverQueue) {
            const queueConstruct = {
                textChannel: message.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 5,
                playing: true,
                loop: false,
            }
            queue.set(message.guild.id, queueConstruct)

            queueConstruct.songs.push(song)

            try {
                var connection = await voiceChannel.join()
                queueConstruct.connection = connection
                play(message.guild, queueConstruct.songs[0])
            } catch (error) {
                console.log(error)
                queue.delete(message.guild.id)
            }
        } else {
            serverQueue.songs.push(song)
            return message.channel.send(`**${song.title}** has been added to the music queue.`)
        }
        return undefined
    }

    if(message.content.startsWith(`${PREFIX}stop`)) {
        const voiceChannel = message.member.voice.channel
        if(!voiceChannel) return message.channel.send("I need to be in a voice channel to stop the music.")
        if(!serverQueue) return message.channel.send("There is no song playing in the queue.")
        serverQueue.songs = []
        serverQueue.connection.dispatcher.end()
        message.channel.send("The current music has stopped.")
    }

    if(message.content.startsWith(`${PREFIX}join`)) {
        const voiceChannel = message.member.voice.channel
        if(!voiceChannel) return message.channel.send("I need to be in a voice channel to join it.")
        var connection = voiceChannel.join()
    }
    
    if(message.content.startsWith(`${PREFIX}leave`)) {
        const voiceChannel = message.member.voice.channel
        if(!voiceChannel) return message.channel.send("I need to be in a voice channel to leave it.")
        voiceChannel.leave()
    }
    if(message.content.startsWith(`${PREFIX}skip`) || message.content.startsWith(`${PREFIX}s`)) {
        const voiceChannel = message.member.voice.channel
        if(!voiceChannel) return message.channel.send('You need to be in a voice channel.')
        if(!serverQueue) return message.channel.send("There is no song playing in the queue.")
        serverQueue.connection.dispatcher.end()
        message.channel.send(`Skipped the current song.`)
    }
    if(message.content.startsWith(`${PREFIX}volume`)) {
        if(!message.member.voice.channel) return message.channel.send("You need to be in a voice channel.")
        if(!serverQueue) return message.channel.send("There are no songs playing in the queue")
        if(!args[1]) return message.channel.send(`That volume is: **${serverQueue.volume}`)
        if(isNaN(args[1])) return message.channel.send("That is not a valid amount to change the volume to.")
        serverQueue.volume = args[1]
        serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 10)
        message.channel.send(`I have changed to volume to: **${args[1]}**`)
    }
    if(message.content.startsWith(`${PREFIX}np`)) {
        if(!serverQueue) return message.channel.send('There is nothing playing currently.')
        message.channel.send(`Now playing: **${serverQueue.songs[0].title}**`)
    }
    if(message.content.startsWith(`${PREFIX}queue`)) {
        if(!serverQueue) return message.channel.send("There is nothing playing.")
        const newEmbed = new MessageEmbed()
        .setTitle('Song Queue')
        .setDescription(`
            **Currently playing:** ${serverQueue.songs[0].title} \n
            **Songs In Queue**
            ${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
        `)
        message.channel.send(newEmbed)
    }
    if(message.content.startsWith(`${PREFIX}pause`)) {
        if(!message.member.voice.channel) return message.channel.send("You need to be in a voice channel to use this command.")
        if(!serverQueue) return message.channel.send("There are no songs playing.")
        if(!serverQueue.playing) return message,channel.send("The music is already paused.")
        serverQueue.playing = false
        serverQueue.connection.dispatcher.pause()
        message.channel.send("The music is now paused.")
    }
    if(message.content.startsWith(`${PREFIX}resume`)) {
        if(!message.member.voice.channel) return message.channel.send("You need to be in a voice channel.")
        if(!serverQueue) return message.channel.send("There are no songs playing.")
        if(serverQueue.playing) return message.channel.send("The music is already playing.")
        serverQueue.playing = true
        serverQueue.connection.dispatcher.resume()
        message.channel.send("The music is now playing again.")        
    }
    if(message.content.startsWith(`${PREFIX}loop`)) {
        if(!message.member.voice.channel) return message.channel.send("You need to be in a voice channel.")
        if(!serverQueue) return message.channel.send("There is nothing playing.")

        serverQueue.loop = !serverQueue.loop
        return message.channel.send(`I have now ${serverQueue.loop ? `**Enabled**` : `**Disabled**`} loop.`)
    }
})


function play(guild, song) {
    const serverQueue = queue.get(guild.id)

    if(!song) {
        queue.delete(guild.id)
        return
    }

    const dispatcher = serverQueue.connection.play(ytdl(song.url))
    .on('finish', () => {
        if(!serverQueue.loop)return serverQueue.songs.shift()
        play(guild, serverQueue.songs[0])
    })
    .on('error', error => {
        console.log(error)
    })
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5)

    serverQueue.textChannel.send(`Started playing: **${song.title}**`)
}

client.login(process.env.TOKEN)