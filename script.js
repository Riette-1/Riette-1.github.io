const daysEl = document.getElementById("days");
const hoursEl = document.getElementById("hours");
const minsEl = document.getElementById("mins");
const secondsEl = document.getElementById("seconds");

const xmas = "26 Dec 2021";
let days = 0;
function countdown() {
    const xmasDate = new Date(xmas);
    const currentDate = new Date();

    const totalSeconds = (xmasDate - currentDate) / 1000;

    days = Math.floor(totalSeconds / 3600 / 24);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const mins = Math.floor(totalSeconds / 60) % 60;
    const seconds = Math.floor(totalSeconds) % 60;

    daysEl.innerHTML = days;
    hoursEl.innerHTML = formatTime(hours);
    minsEl.innerHTML = formatTime(mins);
    secondsEl.innerHTML = formatTime(seconds);
}

function formatTime(time) {
    return time < 10 ? `0${time}` : time;
}

// initial call
countdown();

setInterval(countdown, 1000);
let instrToday;
let instructionEl = document.getElementById("instruction");

function dailyInstruction() {
    const instructions = [
        "Geseënde Kersfees!",
        "Haal 'n bietjie asem...amper daar!",
        "Wat eet ons more?  Oormore? Die res van die jaar??",
        "Drink genoeg water.",
        "Wie koop sjampanje en wie sit dit solank in die yskas?",
        "Tref laaste reëlings vir kersdag.",
        "Gaan vir 'n stappie",
        "Vang bietjie 'n tan...lyk maar bleek, jong!",
        "Gaan gym toe en eet 'n vrug.",
        "Kyk of daar specials op gammon is...",
        "'It is our choices, Harry, that show what we truly are, far more than our abilities.' ~ Albus Dumbledore, Harry Potter and the Chamber of Secrets",
        "Toets die swembadwater.",
        "Haal die koeke uit die oond.",
        "Luister na jou gunsteling kersliedjies.",
        "Wanneer gaan ons see toe?",
        "Vis en tjips en witwyn.",
        "Kry jou hare reg vir die festive season.",
        "Create your future.  Be original.  Take risks.  Celebrate life!",
        "You can't bake a cake if you're not willing to break a few eggs.",
        "A day without laughter is a day wasted.",
        "A wise man doesn't give the right answers, he poses the right questions.",
        "Maak vinnig die huis skoon.",
        "'It does not do to dwell on dreams and forget to live. ~ Albus Dumbledore'",
        "'A little nonsense now and then is relished by the wisest men.' ~ Willy Wonka",
        "Bel iemand wat jy lanklaas gesien het.",
        "Bel jou kinders.",
        "Bel iemand wat jy lanklaas gesien het.",
        "Lê bietjie buite rond.",
        "Drink 'n glasie wyn."
    ]

    var arrayLength = instructions.length;

    for (var i = 0; i < arrayLength; i++) {
        if (days == i) {
            instrToday = instructions[i];
            instructionEl.innerHTML = instrToday;
        }

    }
}

//calling function
dailyInstruction();
