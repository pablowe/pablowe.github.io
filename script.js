//HAMBURGER
        $hamburger = $(".hamburger");
        let hamburgerX = false;

        function changeToDefault() {
            $hamburger.addClass("x");
            setTimeout(function() {
                $hamburger.removeClass("x");
                $hamburger.addClass("x2");
            }, 300)
            hamburgerX = true;
        }

        function changeToX() {
            $hamburger.removeClass("x2");
            $hamburger.addClass("x");
            setTimeout(function() {
                $hamburger.removeClass("x");
            }, 300)
            hamburgerX = false;
        }

        $hamburger.on("click", function() {
            if (hamburgerX === false) {
                changeToDefault();
            } else {
                changeToX();
            }

        })
        //MENU PULL-DOWN
        $hamburger.on("click", pullDown);

        function pullDown() {
            $(".pulldownMenu div").each(function() {
                $(this).toggleClass("active");
            })
        }

        //sections appear animations

        //about
        const sectionAbout = document.querySelector("section.about");
        const sectionAboutHeight = sectionAbout.offsetHeight;
        const sectionAboutFromTop = sectionAbout.offsetTop;
        const secAboutH2 = document.querySelector("section.about h2");
        const imgMe = document.querySelector(".imgMe");

        function scrollH2Animation() {
            if (window.scrollY > sectionAboutFromTop - sectionAboutHeight + 250) {
                secAboutH2.classList.add("active");
            }
        }

        function scrollAboutImgAnimation() {
            if (window.scrollY > sectionAboutFromTop - sectionAboutHeight + 250) {
                imgMe.classList.add("active");
            }
        }

        //skills
        const sectionSkills = document.querySelector("section.skills");
        const sectionSkillsHeight = sectionSkills.offsetHeight;
        const sectionSkillsFromTop = sectionSkills.offsetTop;
        const skillLogos = document.querySelectorAll(".wrap div");
        const secSkillsH2 = document.querySelector(".wrap h2");

        function scrollSkillsH2Anim() {
            if (window.scrollY > sectionSkillsFromTop - sectionSkillsHeight + 350) {
                secSkillsH2.classList.add("active");
            }
        }

        function logoAnimation() {
            if (window.scrollY > sectionSkillsFromTop - sectionSkillsHeight + 350) {
                let delay = 0;
                skillLogos.forEach((skillLogo) => {
                    delay += 100;
                    setTimeout(function() {
                        skillLogo.classList.add("active");
                    }, delay)
                })
            }
        }
        const skillsH3 = document.querySelector(".skills h3:nth-of-type(1)");
        const additionalSkillsP = document.querySelector(".additionalSkillsP");

        function scrollSkillsH3Anim() {
            if (window.scrollY > skillsH3.offsetTop - sectionSkillsHeight + 350) {
                skillsH3.classList.add("active");
                additionalSkillsP.classList.add("active");
            }
        }

        const skillsLearningH3 = document.querySelector(".skills h3:nth-of-type(2)");
        const learningLogos = document.querySelectorAll(".wrapLearning div");

        function scrollLearningAnim() {
            if (window.scrollY > skillsLearningH3.offsetTop - sectionSkillsHeight + 350) {
                skillsLearningH3.classList.add("active");
                learningLogos.forEach((learningLogo) => {
                    learningLogo.classList.add("active");
                })
            }
        }


        var didScroll = false;
        window.onscroll = doOnScroll;

        function doOnScroll() {
            didScroll = true;
        }

        setInterval(function() {
            if (didScroll) {
                didScroll = false;
                scrollH2Animation();
                scrollAboutImgAnimation();
                scrollSkillsH2Anim();
                logoAnimation();
                scrollSkillsH3Anim();
                scrollLearningAnim();
            }
        }, 100);
        //language
        const pl = document.querySelector(".pl");
        const eng = document.querySelector(".eng");

        let isEnglish = true;

        pl.addEventListener("click", changeLanguage);
        eng.addEventListener("click", changeLanguage);

        function changeLanguage() {
            if (isEnglish) {
                // main page
                $(".mainP1").text("Witaj świecie,");
                $(".mainP2").text("Projektowanie stron to moja pasja");
                // text size change
                $(".mainP2").css("font-size", "16px");
                // menu
                $(".pulldownMenu #about").text("O mnie");
                $(".pulldownMenu #skills").text("Umiejętności");
                $(".pulldownMenu #contact").text("Kontakt");
                // section about
                $(".about h2").text("O mnie");
                $(".about div:nth-of-type(2)").text("Nazywam się Paweł Wędrowski, mam 22 lata. Od kliku miesięcy uczę się technik front-endu. Szukam pracy/stażu/praktyk w Warszawie, bardzo szybko się uczę i chętnie poznaje nowe rzeczy. Poza doskonaleniem technik front-endowych uczę się backendu - aktualnie w Node.js. Prywatnie jestem zapalonym graczem - w przyszłości chciałbym pracować przy tworzeniu gier - oraz miłośnikiem aktywnego i zdrowegu trybu życia.");
                // section skills
                $(".skills h2").text("Umiejętności");
                $(".skills h3").text("Dodatkowe umiejętności");
                $(".additionalSkillsP").text("Znam techniki responsywnych stron (media-queries czy pojęcie mobile first nie jest mi obce). Ponadto znam i wykorzystuję standardy układu strony, mój kod staram się tworzyć tak, by był zrozumiały dla innych. Dodatkowo znam podstawy języka C++ oraz Java. Język angielski na poziomie intermediate / upper-intermediate.");
                $(".skills h3:nth-of-type(2)").text("W trakcie nauki");
                // section contact
                $(".contact h2").text("Kontakt");
                $(".dot p").text("warszawa");

                isEnglish = false;
            } else {
                // main page
                $(".mainP1").text("Hello world,");
                $(".mainP2").text("web design is my passion");
                // text size change
                $(".mainP2").css("font-size", "20px");
                // menu
                $(".pulldownMenu #about").text("About me");
                $(".pulldownMenu #skills").text("my skills");
                $(".pulldownMenu #contact").text("contact details");
                // section about
                $(".about h2").text("about me");
                $(".about div:nth-of-type(2)").text("Hi everyone, my name is Paweł Wędrowski and I am 22 years old. Since four months I am developing my front-end skills. I am looking for a job or an internship in Warsaw. I enjoy learning new technologies and can assimilate with new ideas quickly. Apart from improving front-end skills I am getting familiar witch back end technologies - currently Node.js. I am a true game lover and in the future I want ot take part in creating them. Besides that, I run a healthy lifestyle and enjoy Netflix and chill.");
                // section skills
                $(".skills h2").text("My skills");
                $(".skills h3").text("additional skills");
                $(".additionalSkillsP").text("I am familiar with Responsive Web Design (I am not stranger to media-queries or 'mobile first' idea). Besides that I know C++ and Java basics. Intermediate / upper-intermediate english level.");
                $(".skills h3:nth-of-type(2)").text("currently learning");
                // section contact
                $(".contact h2").text("contact details");
                $(".dot p").text("warsaw");

                isEnglish = true;
            }
        }

        //menu navigation
        let menuBarHeight = 46;

        $("#about").on("click", function() {
            changeToX();
            pullDown();

            $("html, body").animate({
                scrollTop: $(".about").offset().top - menuBarHeight
            }, 700);
        })
        $("#skills").on("click", function() {
            changeToX();
            pullDown();

            $("html, body").animate({
                scrollTop: $(".skills").offset().top - menuBarHeight
            }, 700);
        })
        $("#contact").on("click", function() {
            changeToX();
            pullDown();

            $("html, body").animate({
                scrollTop: $(".contact").offset().top - menuBarHeight
            }, 700);
        })
        //arrow scroll down
        $(".arrow").on("click", function() {
            $("html, body").animate({
                scrollTop: $(".about").offset().top - menuBarHeight
            }, 700);
        })
